from __future__ import annotations

import time
from typing import Any

import json

from ai_providers import pick_llm_attempt_order, resolve_ai_priority
from config import Config, mkdir_data_dir
from flask import Flask, jsonify, request
from openai_client import chat_text_completion

from flask_cors import CORS
from flask_socketio import SocketIO, emit

from models import Base


def ensure_schema(engine) -> None:
    Base.metadata.create_all(bind=engine)


def create_engine_and_session(database_uri: str):
    mkdir_data_dir(database_uri)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    # normalize quad slash for pathlib
    engine = create_engine(database_uri, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)
    return engine, SessionLocal


def create_app():
    mkdir_data_dir(Config.SQLALCHEMY_DATABASE_URI)
    cfg_flask = Config()
    app = Flask(__name__)
    app.config.from_object(cfg_flask)
    cors = CORS(app, origins=cfg_flask.CORS_ORIGINS)

    mq = getattr(cfg_flask, "SOCKETIO_MESSAGE_QUEUE", None) or ""

    socketio_kwargs = dict(
        cors_allowed_origins=cfg_flask.CORS_ORIGINS,
        async_mode="eventlet",
    )
    if mq.strip():
        socketio_kwargs["message_queue"] = mq

    socketio = SocketIO(app, **socketio_kwargs)

    app.config["_socketio_instance"] = socketio

    from fleet_loader import load_fleet_json
    from simulator import FleetSimulator

    fleet_path = getattr(cfg_flask, "FLEET_JSON_PATH", Config.FLEET_JSON_PATH)

    fleet_cfg_obj = load_fleet_json(fleet_path)

    engine, SessionLocal = create_engine_and_session(cfg_flask.SQLALCHEMY_DATABASE_URI)
    ensure_schema(engine)

    def session_provider():
        return SessionLocal()

    clients: dict[str, dict[str, Any]] = {}

    sim = FleetSimulator(
        fleet_cfg_obj,
        session_provider,
        socketio,
        tick_hz=cfg_flask.TICK_HZ,
        marine_snapshot_provider=lambda: __import__(
            "weather",
            fromlist=["fetch_marine_window"],
        ).fetch_marine_window(bbox=fleet_cfg_obj.bounding_box),
        groq_key=cfg_flask.GROQ_API_KEY,
        groq_model=cfg_flask.GROQ_MODEL,
        openai_key=cfg_flask.OPENAI_API_KEY,
        openai_model=cfg_flask.OPENAI_MODEL,
        fleet_multicast=None,
    )

    def multicast_fleet(reason: str = "update") -> None:
        """Per-socket payloads: captains never receive other hulls' track data."""
        for sid in list(clients.keys()):
            meta = clients.get(sid) or {}
            role = meta.get("role")
            cid = meta.get("ship_id") if role == "captain" else None
            data = sim.fleet_payload(captain_ship_id=cid)
            data["reason"] = reason
            socketio.emit("fleet_snapshot", data, to=sid)

    sim._fleet_multicast = multicast_fleet

    def require_command(sid: str) -> bool:
        return clients.get(sid, {}).get("role") == "command"

    def _slim_captain_context(payload: dict[str, Any]) -> dict[str, Any]:
        ships = payload.get("ships") or []
        return {
            "scenario": payload.get("scenario"),
            "maritime_conditions": payload.get("maritime_conditions"),
            "ship": ships[0] if ships else None,
            "alerts": payload.get("alerts"),
            "directives": payload.get("directives"),
            "assistance": payload.get("assistance"),
            "restricted_zones_count": len(payload.get("zones") or []),
        }

    @app.route("/api/health")
    def health():
        has_o = bool(str(cfg_flask.OPENAI_API_KEY or "").strip())
        has_g = bool(str(cfg_flask.GROQ_API_KEY or "").strip())
        order = pick_llm_attempt_order(resolve_ai_priority(), has_openai=has_o, has_groq=has_g)
        return {
            "status": "ok",
            "fleet": True,
            "ts": time.time(),
            "nlp": {
                "priority": resolve_ai_priority(),
                "providers_configured": {"openai": has_o, "groq": has_g},
                "attempt_order": order,
            },
        }

    @app.route("/api/history")
    def history_endpoint():
        return jsonify(sim.history_window())

    @app.route("/api/fleet")
    def fleet_endpoint():
        return jsonify(sim.fleet_payload(captain_ship_id=None))

    @socketio.on("connect")
    def ws_connect():
        clients.setdefault(
            request.sid,
            {"role": "observer", "ship_id": None, "joined": time.time()},
        )
        meta = clients[request.sid]
        cid = meta.get("ship_id") if meta.get("role") == "captain" else None
        emit("fleet_snapshot", sim.fleet_payload(captain_ship_id=cid))

    @socketio.on("disconnect")
    def ws_disconnect():
        clients.pop(request.sid, None)

    @socketio.on("session_identify")
    def ws_identify(data):
        payload = dict(data or {})
        role = payload.get("role", "observer")
        ship_id = payload.get("ship_id")
        clients[request.sid] = {
            "role": role if role in {"command", "captain", "observer"} else "observer",
            "ship_id": ship_id if role == "captain" else None,
            "joined": time.time(),
        }
        cid = ship_id if role == "captain" else None
        emit("fleet_snapshot", sim.fleet_payload(captain_ship_id=cid))
        emit("identified", {"ok": True})

    def broadcast_state(reason: str = "interaction"):
        multicast_fleet(reason)

    @socketio.on("zone_upsert")
    def ws_zone_upsert(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        zone = payload or {}
        sim.upsert_zone(zone)
        broadcast_state("zones")

    @socketio.on("zone_delete")
    def ws_zone_delete(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        sim.delete_zone(payload.get("uuid"))
        broadcast_state("zones_delete")

    @socketio.on("directive_issue")
    def ws_directive(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        res = sim.issue_directive(payload)
        emit("directive_issued", res)
        broadcast_state("directive")

    @socketio.on("captain_response")
    def ws_captain_response(payload):
        info = clients.get(request.sid, {})
        if info.get("role") != "captain":
            emit("command_error", {"message": "captain_only"})
            return
        sid_ship = payload.get("ship_id")
        if sid_ship != info.get("ship_id"):
            emit("command_error", {"message": "wrong_ship"})
            return
        sim.captain_respond(
            payload.get("directive_uuid"),
            payload.get("response"),
            payload.get("note"),
        )
        broadcast_state("captain_response")

    @socketio.on("distress_message")
    def ws_distress(payload):
        info = clients.get(request.sid, {})
        if info.get("role") != "captain":
            emit("command_error", {"message": "captains_only"})
            return
        sim.send_freeform_distress(payload.get("ship_id"), payload.get("text", ""))
        broadcast_state("distress")

    @socketio.on("captain_issue_chat")
    def ws_captain_issue_chat(payload):
        """Captain-only Q&A against OpenAI using hull-local snapshot context."""
        info = clients.get(request.sid, {})
        if info.get("role") != "captain":
            emit("captain_chat_result", {"ok": False, "error": "captains_only"})
            return
        oid = info.get("ship_id")
        if not oid:
            emit("captain_chat_result", {"ok": False, "error": "missing_ship"})
            return
        key = (cfg_flask.OPENAI_API_KEY or "").strip()
        if not key:
            emit("captain_chat_result", {"ok": False, "error": "openai_not_configured"})
            return

        raw = payload or {}
        message = str(raw.get("message") or "").strip()
        if not message:
            emit("captain_chat_result", {"ok": False, "error": "empty_message"})
            return
        if len(message) > 4000:
            emit("captain_chat_result", {"ok": False, "error": "message_too_long"})
            return

        history_in = raw.get("history") or []
        prior: list[dict[str, str]] = []
        if isinstance(history_in, list):
            for item in history_in[-16:]:
                if not isinstance(item, dict):
                    continue
                role = item.get("role")
                content = str(item.get("content") or "").strip()
                if role not in ("user", "assistant") or not content:
                    continue
                if len(content) > 4000:
                    continue
                prior.append({"role": role, "content": content})

        ctx_obj = _slim_captain_context(sim.fleet_payload(captain_ship_id=str(oid)))
        ctx_blob = json.dumps(ctx_obj, separators=(",", ":"), default=str)[:12000]

        system = (
            "You are a concise maritime operations assistant on a segregated captain datalink. "
            "You only see the JSON context appended below (alerts, directives, assistance, own-ship state). "
            "Explain issues, risks, and sensible next steps in plain language. "
            "Do not invent contacts, orders, or data not present in the context. "
            "If something is unknown from context, say so. "
            "You do not issue commands; recommend only.\n\n"
            f"Hull-local snapshot (JSON; refreshed for this exchange):\n{ctx_blob}"
        )

        convo: list[dict[str, str]] = [{"role": "system", "content": system}]
        convo.extend(prior)
        convo.append({"role": "user", "content": message})

        try:
            reply = chat_text_completion(
                api_key=key,
                model=cfg_flask.OPENAI_MODEL,
                messages=convo,
                max_tokens=1024,
                temperature=0.35,
            )
            emit("captain_chat_result", {"ok": True, "reply": reply or "(no text)"})
        except Exception as ex:
            emit("captain_chat_result", {"ok": False, "error": str(ex)[:400]})

    @socketio.on("alert_ack")
    def ws_ack(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        sim.acknowledge_alert(payload.get("uuid"))
        broadcast_state("alert_ack")

    @socketio.on("alert_clear")
    def ws_clear(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        sim.clear_alert(payload.get("uuid"))
        broadcast_state("alert_clear")

    @socketio.on("route_profiles")
    def ws_route_profiles(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        ship_id = payload.get("ship_id")
        res = sim.compute_route_profiles(ship_id)
        emit("route_profiles_result", {"ship_id": ship_id, "profiles": res})
        broadcast_state("profiles")

    @socketio.on("route_select")
    def ws_route_select(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        ok = sim.select_route_variant(payload.get("ship_id"), payload.get("profile"))
        emit("route_select_result", {"ok": ok})
        broadcast_state("route_select")

    @socketio.on("assistance_request")
    def ws_assist_req(payload):
        """Any authenticated captain can originate from their hull."""
        info = clients.get(request.sid, {})
        if info.get("role") != "captain":
            emit("command_error", {"message": "captains_only"})
            return
        if payload.get("requesting_ship_id") != info.get("ship_id"):
            emit("command_error", {"message": "spoof_blocked"})
            return
        sim.record_assistance(payload)
        broadcast_state("assist_req")

    @socketio.on("assistance_resolve")
    def ws_assist_res(payload):
        from models import AssistanceRow

        info = clients.get(request.sid, {})
        uuid_str = payload.get("uuid")
        status_val = payload.get("status", "accepted")
        with SessionLocal() as session:
            row = session.query(AssistanceRow).filter_by(uuid=uuid_str).one_or_none()
            if row is None:
                emit("command_error", {"message": "assist_not_found"})
                return
            if info.get("role") == "command":
                pass
            elif info.get("role") == "captain" and row.target_ship_id == info.get("ship_id"):
                pass
            else:
                emit("command_error", {"message": "assist_resolve_forbidden"})
                return
        sim.respond_assistance(uuid_str, status_val)
        broadcast_state("assist_res")

    @socketio.on("advisor_feedback")
    def ws_advisor_feedback(payload):
        if not require_command(request.sid):
            emit("command_error", {"message": "unauthorized"})
            return
        sim.advisor_feedback(payload.get("uuid"), payload.get("status", "accepted"))
        broadcast_state("advisor_feedback")

    @socketio.on("helper_suggestions")
    def ws_helpers(payload):
        from assistance import propose_helpers

        ship_id = payload.get("ship_id")
        hulls = {
            s["shipId"]: {"position": s["position"], "name": s["name"]}
            for s in sim.fleet_payload().get("ships", [])
        }
        emit("helper_suggestions_result", {"ship_id": ship_id, "helpers": propose_helpers(hulls, ship_id)})

    app.extensions["simulator"] = sim
    app.extensions["socketio"] = socketio
    app.extensions["clients"] = clients

    return app, socketio, sim


def spawn_simulation_loop(app, sim, _socketio):
    import eventlet

    hz = max(2.0, float(Config.TICK_HZ))

    def loop():
        while True:
            eventlet.sleep(1.0 / hz)
            with app.app_context():
                sim.tick()

    eventlet.spawn(loop)
