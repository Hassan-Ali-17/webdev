"""Central fleet simulation orchestrator."""

from __future__ import annotations

import json
import threading
import time
import uuid
from collections import defaultdict
from typing import Any, Callable

from flask_socketio import SocketIO
from sqlalchemy.orm import Session

from geo_utils import (
    bearing_deg,
    estimate_eta_minutes,
    destination_point,
    haversine_m,
    nautical_miles,
    point_in_polygon_latlng,
    point_in_or_near_navigable,
    route_crosses_polygon,
)
from fleet_loader import ScenarioConfig, ports_by_id
from models import AdvisorSuggestionRow, AlertRow, AssistanceRow, DistressRow, DirectiveRow, FleetSnapshot, RestrictedZoneRow
from predictive import collision_eta_pair, fuel_shortfall_warning, march_intersection_eta_minutes
from routing import GridRouter
from weather import adverse_multiplier_from_marine


BASE_FUEL_TONS_PER_NM = 0.014


class FleetSimulator:
    def __init__(
        self,
        cfg: ScenarioConfig,
        session_factory: Callable[[], Session],
        socketio: SocketIO | None,
        *,
        tick_hz: float = 4.0,
        marine_snapshot_provider: Callable[[], dict[str, Any] | None],
        groq_key: str | None,
        groq_model: str,
        openai_key: str | None,
        openai_model: str,
        fleet_multicast: Callable[[str], None] | None = None,
    ) -> None:
        self.cfg = cfg
        self.session_factory = session_factory
        self.socketio = socketio
        self._fleet_multicast = fleet_multicast
        self.tick_hz = max(2.0, tick_hz)
        self.marine_snapshot_provider = marine_snapshot_provider
        self.groq_key = groq_key
        self.groq_model = groq_model
        self.openai_key = openai_key
        self.openai_model = openai_model
        self.ports_map = ports_by_id(cfg)

        self.lock = threading.RLock()
        self.ships: dict[str, dict[str, Any]] = {}
        self.zones: list[dict[str, Any]] = []
        self.alerts_history: dict[str, dict[str, Any]] = {}
        self.directives_history: dict[str, dict[str, Any]] = {}
        self.maritime_conditions: dict[str, Any] = {"label": "Baseline", "source": "synthetic"}
        self.server_epoch = time.time()
        self.last_snapshot_ts = 0.0
        self.next_advisor_ts = 0.0
        self.proximity_cooldown: dict[tuple[str, str], float] = {}
        self.zone_prev_inside: defaultdict[str, dict[str, bool]] = defaultdict(dict)
        self.predictive_pulse = 0
        self.predictive_cooldown: dict[str, float] = {}
        self._router = GridRouter(cfg.navigable_water, cfg.bounding_box)

        self._bootstrap_ships()
        self._load_zones_db()
        self._initial_routes_all()

    def _bootstrap_ships(self) -> None:
        for row in self.cfg.fleet:
            sid = row["shipId"]
            ship = dict(row)
            ship["position"] = list(row["position"])
            ship["route"] = [list(row["position"])]
            ship["destination_id"] = row["destination"]
            ship["cargo"] = row.get("cargo", "")
            ship["waypoint_index"] = 0
            ship["holding"] = False
            ship["adverse_weather"] = False
            ship["weather_multiplier"] = 1.05
            ship["eta_minutes"] = None
            ship["_fuel_efficiency_nm_per_ton"] = 425.0
            ship["selected_route_profile"] = "safest"
            ship["route_options"] = {}
            ship["assist_request"] = None
            self.ships[sid] = ship

    def _load_zones_db(self) -> None:
        with self.session_factory() as session:
            rows = session.query(RestrictedZoneRow).order_by(RestrictedZoneRow.id.asc()).all()
            self.zones = [
                {
                    "uuid": r.zone_uuid,
                    "name": r.name,
                    "coordinates": json.loads(r.polygon_json),
                }
                for r in rows
            ]

    def _persist_snapshot_if_needed(self) -> None:
        now = time.time()
        interval = 30
        if now - self.last_snapshot_ts < interval:
            return
        self.last_snapshot_ts = now
        payload = {
            "ts": now,
            "ships": self._serialize_public_ships(),
            "conditions": dict(self.maritime_conditions),
            "zones": list(self.zones),
        }
        with self.session_factory() as session:
            snap = FleetSnapshot(ts_unix=now, payload_json=json.dumps(payload))
            session.add(snap)
            cutoff = now - 3605
            session.query(FleetSnapshot).filter(FleetSnapshot.ts_unix < cutoff).delete()
            session.commit()

    def _serialize_alert(self, row: AlertRow | dict) -> dict:
        if isinstance(row, dict):
            return row
        return {
            "uuid": row.uuid,
            "kind": row.kind,
            "severity_score": row.severity_score,
            "ship_id": row.ship_id,
            "secondary_ship_id": row.secondary_ship_id,
            "zone_uuid": row.zone_uuid,
            "title": row.title,
            "body": row.body,
            "acknowledged": row.acknowledged,
            "cleared": row.cleared,
            "predictive": row.predictive,
            "metadata": json.loads(row.metadata_json) if row.metadata_json else None,
            "created_at": row.created_at.timestamp(),
        }

    def _current_alerts(self, session: Session) -> list[dict]:
        rows = (
            session.query(AlertRow)
            .filter(AlertRow.cleared.is_(False))
            .order_by(AlertRow.severity_score.desc(), AlertRow.id.desc())
            .limit(200)
            .all()
        )
        return [self._serialize_alert(r) for r in rows]

    def _serialize_public_ships(self) -> list[dict]:
        out: list[dict] = []
        for ship in self.ships.values():
            payload = {
                "shipId": ship["shipId"],
                "name": ship["name"],
                "position": list(ship["position"]),
                "speed": ship["speed"],
                "heading": ship["heading"],
                "destination": ship["destination_id"],
                "fuel": round(ship["fuel"], 2),
                "cargo": ship["cargo"],
                "status": ship["status"],
                "route": [list(p) for p in ship.get("route") or []],
                "eta_minutes": ship.get("eta_minutes"),
                "holding": ship.get("holding"),
                "adverse_weather": ship.get("adverse_weather"),
                "weather_multiplier": round(ship.get("weather_multiplier", 1), 4),
                "selected_route_profile": ship.get("selected_route_profile"),
                "route_options": ship.get("route_options"),
                "assist_request": ship.get("assist_request"),
                "directive_pending": ship.get("directive_pending"),
            }
            out.append(payload)
        out.sort(key=lambda s: s["shipId"])
        return out

    @staticmethod
    def _captain_should_see_alert(alert: dict, hull_id: str) -> bool:
        if alert.get("ship_id") == hull_id or alert.get("secondary_ship_id") == hull_id:
            return True
        return False

    def fleet_payload(self, *, captain_ship_id: str | None = None) -> dict:
        with self.lock:
            advisors: list[dict] = []
            with self.session_factory() as session:
                alerts_all = self._current_alerts(session)
                drows = (
                    session.query(DirectiveRow)
                    .filter(DirectiveRow.status.in_(("pending", "accepted")))
                    .order_by(DirectiveRow.id.desc())
                    .limit(100)
                    .all()
                )
                directives_all = [
                    {
                        "uuid": dr.uuid,
                        "ship_id": dr.ship_id,
                        "type": dr.directive_type,
                        "payload": json.loads(dr.payload_json),
                        "status": dr.status,
                        "captain_response": dr.captain_response,
                    }
                    for dr in drows
                ]
                assistance_rows = (
                    session.query(AssistanceRow)
                    .filter(AssistanceRow.status.in_(("pending", "accepted")))
                    .order_by(AssistanceRow.id.desc())
                    .limit(40)
                    .all()
                )

            ships = self._serialize_public_ships()
            fleet_contact_count = len(ships)

            if captain_ship_id:
                cid = captain_ship_id
                ships = [s for s in ships if s["shipId"] == cid]
                directives = [d for d in directives_all if d["ship_id"] == cid]
                alerts = [a for a in alerts_all if self._captain_should_see_alert(a, cid)]
                assistance_list = [
                    ar for ar in assistance_rows if ar.requesting_ship_id == cid or ar.target_ship_id == cid
                ]
                view_role = "captain"
            else:
                directives = directives_all
                alerts = alerts_all
                assistance_list = list(assistance_rows)
                view_role = "command"
                with self.session_factory() as session:
                    adv_rows = session.query(AdvisorSuggestionRow).order_by(AdvisorSuggestionRow.id.desc()).limit(6).all()
                    advisors = [
                        {
                            "uuid": row.uuid,
                            "title": row.title,
                            "rationale": row.rationale,
                            "status": row.status,
                            "action": json.loads(row.action_json),
                        }
                        for row in adv_rows
                    ]

            snapshot = dict(self.maritime_conditions)
            return {
                "server_time": time.time(),
                "scenario": self.cfg.raw["scenario"],
                "boundingBox": self.cfg.bounding_box,
                "navigableWater": self.cfg.navigable_water,
                "ports": self.cfg.ports,
                "ships": ships,
                "zones": list(self.zones),
                "alerts": alerts,
                "directives": directives,
                "assistance": [
                    {
                        "uuid": ar.uuid,
                        "requesting_ship_id": ar.requesting_ship_id,
                        "target_ship_id": ar.target_ship_id,
                        "aid_type": ar.aid_type,
                        "status": ar.status,
                    }
                    for ar in assistance_list
                ],
                "maritime_conditions": snapshot,
                "advisor": advisors,
                "view_role": view_role,
                "fleet_contact_count": fleet_contact_count,
            }

    def emit_full_state(self, *, reason: str = "update") -> None:
        if self._fleet_multicast:
            self._fleet_multicast(reason)
            return
        if not self.socketio:
            return
        payload = self.fleet_payload(captain_ship_id=None)
        payload["reason"] = reason
        self.socketio.emit("fleet_snapshot", payload, namespace="/")

    def tick(self) -> None:
        with self.lock:
            dt = 1.0 / self.tick_hz
            marine = self.marine_snapshot_provider()
            self.maritime_conditions = marine or {
                "label": "Operating under synthetic sea state",
                "source": "fallback",
                "wave_height_m": None,
            }
            for ship in self.ships.values():
                mult = adverse_multiplier_from_marine(marine, ship["position"][0], ship["position"][1])
                ship["weather_multiplier"] = mult
                ship["adverse_weather"] = mult >= 1.18

            self._move_ships(dt)
            self._burn_fuel(dt)
            self._zone_checks()
            self._proximity_checks()
            self._predictive_checks()
            self._reroute_for_intersections()
            self._fleet_advisor_maybe()
            self._persist_snapshot_if_needed()

        self.emit_full_state(reason="tick")

    def _goal_for_ship(self, ship: dict[str, Any]) -> list[float]:
        if ship.get("_divert_waypoint"):
            wp = ship["_divert_waypoint"]
            return [float(wp[0]), float(wp[1])]
        dest = ship["destination_id"]
        port = self.ports_map[dest]["position"]
        return [float(port[0]), float(port[1])]

    def _restricted_polygons(self) -> list[list[list[float]]]:
        return [z["coordinates"] for z in self.zones if len(z["coordinates"]) >= 3]

    def _weather_edge_cost(self, lat: float, lng: float) -> float:
        return adverse_multiplier_from_marine(self.maritime_conditions, lat, lng)

    def compute_route_profiles(self, ship_id: str) -> dict[str, Any]:
        with self.lock:
            ship = self.ships.get(ship_id)
            if not ship:
                return {}
            profiles = self._router.compute_paths(
                ship["position"],
                self._goal_for_ship(ship),
                self._restricted_polygons(),
                self._weather_edge_cost,
            )
            serialized = {}
            for name, candidate in profiles.items():
                serialized[name] = {
                    "profile": candidate.profile,
                    "nodes": [list(node) for node in candidate.nodes],
                    "distance_nm": round(candidate.cost_nm_equivalent, 2),
                }
            ship["route_options"] = serialized
            return serialized

    def select_route_variant(self, ship_id: str, profile: str) -> bool:
        with self.lock:
            ship = self.ships.get(ship_id)
            if not ship or profile not in ship.get("route_options", {}):
                self.compute_route_profiles(ship_id)
            options = ship.get("route_options") or {}
            if profile not in options:
                plan = self._router.compute_paths(
                    ship["position"],
                    self._goal_for_ship(ship),
                    self._restricted_polygons(),
                    self._weather_edge_cost,
                )
                if profile not in plan:
                    return False
                ship["route"] = [list(n) for n in plan[profile].nodes]
            else:
                ship["route"] = [list(n) for n in options[profile]["nodes"]]
            ship["waypoint_index"] = 0
            ship["selected_route_profile"] = profile
            ship["status"] = "normal"
            return True

    def _initial_routes_all(self) -> None:
        with self.lock:
            for sid in list(self.ships.keys()):
                self.compute_route_profiles(sid)
                ship = self.ships[sid]
                options = ship.get("route_options") or {}
                if not options:
                    continue
                chosen = ship.get("selected_route_profile")
                pref = chosen if chosen in options else sorted(options.keys())[0]
                self.select_route_variant(sid, pref)

    def _move_ships(self, dt: float) -> None:
        for ship in self.ships.values():
            if ship["status"] in {"stranded", "arrived"}:
                continue
            if ship.get("holding"):
                ship["heading"] = ship.get("heading", 0)
                continue
            route = ship.get("route") or []
            if len(route) < 2:
                self._try_replan(ship)
                route = ship.get("route") or []
            if len(route) < 2:
                ship["status"] = "stranded"
                self._emit_alert(
                    kind="navigation_failure",
                    ship_id=ship["shipId"],
                    title=f"{ship['name']} cannot plot course",
                    body="No valid path inside navigable channels with current constraints.",
                    severity=88,
                )
                continue

            idx = min(ship.get("waypoint_index", 0), len(route) - 1)
            target = route[idx]
            pos = ship["position"]
            dist_m = haversine_m(pos, target)
            if dist_m < 750:
                if idx >= len(route) - 1:
                    ship["status"] = "arrived"
                    ship["eta_minutes"] = 0
                    continue
                ship["waypoint_index"] = idx + 1
                target = route[ship["waypoint_index"]]
                dist_m = haversine_m(pos, target)

            heading = bearing_deg(pos, target)
            ship["heading"] = heading
            speed_kts = float(ship["speed"])
            distance_m = speed_kts * 0.514444 * dt
            if distance_m >= dist_m:
                ship["position"] = list(target)
            else:
                ship["position"] = list(destination_point(pos, heading, distance_m))

            if not point_in_or_near_navigable(ship["position"][0], ship["position"][1], self.cfg.navigable_water):
                ship["status"] = "stranded"
                self._emit_alert(
                    kind="off_chart",
                    ship_id=ship["shipId"],
                    title=f"{ship['name']} left navigable envelope",
                    body="Immediate manual review required.",
                    severity=95,
                )
            remaining = self._remaining_route_distance(ship)
            ship["eta_minutes"] = estimate_eta_minutes(remaining, speed_kts)
            short, reason = fuel_shortfall_warning(
                ship,
                remaining_route_nm=remaining,
                weather_mult_for_segment=float(ship.get("weather_multiplier", 1.1)),
            )
            if short and ship["status"] not in {"out_of_fuel", "arrived"}:
                ship["status"] = "insufficient_fuel"
                self._emit_alert(
                    kind="fuel_projection",
                    ship_id=ship["shipId"],
                    title=f"{ship['name']} fuel outlook critical",
                    body=reason or "Fuel margin negative",
                    severity=70,
                    predictive=True,
                )

    def _remaining_route_distance(self, ship: dict) -> float:
        route = ship.get("route") or []
        idx = min(ship.get("waypoint_index", 0), max(len(route) - 1, 0))
        pts = [ship["position"]] + route[idx:]
        total = 0.0
        for a, b in zip(pts, pts[1:]):
            total += nautical_miles(a, b)
        return total

    def _burn_fuel(self, dt: float) -> None:
        for ship in self.ships.values():
            if ship["status"] in {"arrived", "stranded"}:
                continue
            mult = float(ship.get("weather_multiplier", 1.0))
            speed = float(ship["speed"])
            nm = speed * (dt / 3600.0)
            burn = nm * BASE_FUEL_TONS_PER_NM * mult
            if ship.get("holding"):
                burn *= 0.25
            ship["fuel"] = max(0.0, ship["fuel"] - burn)
            if ship["fuel"] <= 0:
                ship["status"] = "out_of_fuel"
                self._emit_alert(
                    kind="fuel_depleted",
                    ship_id=ship["shipId"],
                    title=f"{ship['name']} exhausted bunkers",
                    body="Propulsion offline — coordinate tow or refuel.",
                    severity=99,
                )

    def _try_replan(self, ship: dict) -> None:
        candidates = self._router.compute_paths(
            ship["position"],
            self._goal_for_ship(ship),
            self._restricted_polygons(),
            self._weather_edge_cost,
        )
        if not candidates:
            ship["route"] = [list(ship["position"])]
            ship["status"] = "stranded"
            return
        profile = ship.get("selected_route_profile") or "safest"
        pick = candidates.get(profile) or next(iter(candidates.values()))
        ship["route"] = [list(n) for n in pick.nodes]
        ship["waypoint_index"] = 0
        ship["status"] = "rerouting"

    def _zone_checks(self) -> None:
        for zone in self.zones:
            poly = zone["coordinates"]
            if len(poly) < 3:
                continue
            zu = zone["uuid"]
            for ship in self.ships.values():
                inside = point_in_polygon_latlng(ship["position"][0], ship["position"][1], poly)
                prev = self.zone_prev_inside[ship["shipId"]].get(zu)
                if prev is None:
                    self.zone_prev_inside[ship["shipId"]][zu] = inside
                    continue
                if inside and not prev:
                    self._emit_alert(
                        kind="geofence_breach",
                        ship_id=ship["shipId"],
                        title=f"{ship['name']} entered {zone['name']}",
                        body="Restricted zone intrusion detected — enforcing reroute.",
                        severity=92,
                        zone_uuid=zu,
                    )
                    ship["status"] = "rerouting"
                    self._try_replan(ship)
                self.zone_prev_inside[ship["shipId"]][zu] = inside

    def _proximity_checks(self) -> None:
        ship_ids = list(self.ships.keys())
        now = time.time()
        for i in range(len(ship_ids)):
            for j in range(i + 1, len(ship_ids)):
                sa = self.ships[ship_ids[i]]
                sb = self.ships[ship_ids[j]]
                dist = haversine_m(sa["position"], sb["position"])
                key = tuple(sorted((sa["shipId"], sb["shipId"])))
                if dist <= 2000:
                    last = self.proximity_cooldown.get(key, 0.0)
                    if now - last > 90:
                        self.proximity_cooldown[key] = now
                        self._emit_alert(
                            kind="proximity",
                            ship_id=sa["shipId"],
                            title="Collision proximity window",
                            body=f"{sa['name']} & {sb['name']} within {(dist/1000):.2f} km.",
                            severity=65,
                            secondary_ship_id=sb["shipId"],
                        )

    def _predictive_checks(self) -> None:
        self.predictive_pulse += 1
        if self.predictive_pulse % max(2, int(self.tick_hz)) != 0:
            return
        for zone in self.zones:
            poly = zone["coordinates"]
            if len(poly) < 3:
                continue
            for ship in self.ships.values():
                eta, _impact = march_intersection_eta_minutes(
                    ship["position"],
                    float(ship["heading"]),
                    float(ship["speed"]),
                    poly,
                )
                inside = point_in_polygon_latlng(ship["position"][0], ship["position"][1], poly)
                key = f"pg:{ship['shipId']}:{zone['uuid']}"
                if (
                    eta
                    and eta <= 6
                    and not inside
                    and time.time() - self.predictive_cooldown.get(key, 0) > 240
                ):
                    self.predictive_cooldown[key] = time.time()
                    self._emit_alert(
                        kind="predictive_geofence",
                        ship_id=ship["shipId"],
                        title="Predicted zone ingress",
                        body=f"{ship['name']} may breach {zone['name']} ≈ {eta:.1f} min @ current vector.",
                        severity=55,
                        zone_uuid=zone["uuid"],
                        predictive=True,
                    )

        ids = list(self.ships.keys())
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                sa = self.ships[ids[i]]
                sb = self.ships[ids[j]]
                cet, projected = collision_eta_pair(
                    sa["position"],
                    float(sa["heading"]),
                    float(sa["speed"]),
                    sb["position"],
                    float(sb["heading"]),
                    float(sb["speed"]),
                )
                pkey = f"pc:{':'.join(sorted((sa['shipId'], sb['shipId'])))}"
                if (
                    cet
                    and cet <= 8
                    and projected <= 4200
                    and time.time() - self.predictive_cooldown.get(pkey, 0) > 180
                ):
                    self.predictive_cooldown[pkey] = time.time()
                    self._emit_alert(
                        kind="predictive_collision",
                        ship_id=sa["shipId"],
                        secondary_ship_id=sb["shipId"],
                        title="Collision kinematic convergence",
                        body=f"Estimated CPA under {(projected/1000):.1f} km in {cet:.1f} min assuming steady courses.",
                        severity=60,
                        predictive=True,
                    )

    def _reroute_for_intersections(self) -> None:
        for ship in self.ships.values():
            route = ship.get("route") or []
            reroute_needed = False
            for zone in self.zones:
                if route_crosses_polygon(route, zone["coordinates"]) and zone["coordinates"]:
                    reroute_needed = True
                    break
            if reroute_needed and ship["status"] not in {"arrived"}:
                ship["status"] = "rerouting"
                self._try_replan(ship)

    def _fleet_advisor_maybe(self) -> None:
        now = time.time()
        if now < self.next_advisor_ts:
            return
        self.next_advisor_ts = now + 120
        from ai_advisor import build_advisory

        alerts_sample: list[dict] = []
        with self.session_factory() as session:
            alerts_sample = self._current_alerts(session)[:40]
        digest = {
            "ships": self._serialize_public_ships(),
            "alerts": alerts_sample,
            "zones": self.zones,
        }
        ideas = build_advisory(
            groq_api_key=self.groq_key,
            groq_model=self.groq_model,
            openai_api_key=self.openai_key,
            openai_model=self.openai_model,
            state_summary=digest,
        )
        if not ideas:
            return
        with self.session_factory() as session:
            for suggestion in ideas:
                row = AdvisorSuggestionRow(
                    uuid=str(uuid.uuid4()),
                    title=suggestion["title"],
                    rationale=suggestion["rationale"],
                    action_json=json.dumps(suggestion.get("action") or {}),
                    status="proposed",
                )
                session.add(row)
            session.commit()

    def _emit_alert(
        self,
        *,
        kind: str,
        ship_id: str | None,
        title: str,
        body: str,
        severity: float,
        secondary_ship_id: str | None = None,
        zone_uuid: str | None = None,
        predictive: bool = False,
    ) -> None:
        aid = str(uuid.uuid4())
        with self.session_factory() as session:
            row = AlertRow(
                uuid=aid,
                kind=kind,
                severity_score=severity,
                ship_id=ship_id,
                secondary_ship_id=secondary_ship_id,
                zone_uuid=zone_uuid,
                title=title,
                body=body,
                acknowledged=False,
                cleared=False,
                predictive=predictive,
            )
            session.add(row)
            session.commit()

    def upsert_zone(self, zone: dict[str, Any]) -> None:
        coords = zone.get("coordinates") or []
        zid = zone.get("uuid") or str(uuid.uuid4())
        name = zone.get("name") or "Restricted"
        with self.lock:
            with self.session_factory() as session:
                existing = session.query(RestrictedZoneRow).filter_by(zone_uuid=zid).one_or_none()
                if existing:
                    existing.polygon_json = json.dumps(coords)
                    existing.name = name
                else:
                    session.add(
                        RestrictedZoneRow(zone_uuid=zid, name=name, polygon_json=json.dumps(coords)),
                    )
                session.commit()
            self._load_zones_db()
            for ship in self.ships.values():
                if len(coords) >= 3 and point_in_polygon_latlng(ship["position"][0], ship["position"][1], coords):
                    self._emit_alert(
                        kind="geofence_breach",
                        ship_id=ship["shipId"],
                        title=f"{ship['name']} encircled by new zone",
                        body="Ship already inside freshly published restriction.",
                        severity=96,
                        zone_uuid=zid,
                    )
                    ship["status"] = "rerouting"
                    self._try_replan(ship)

    def delete_zone(self, zone_uuid: str) -> None:
        with self.session_factory() as session:
            session.query(RestrictedZoneRow).filter_by(zone_uuid=zone_uuid).delete()
            session.commit()
        self._load_zones_db()

    def issue_directive(self, payload: dict[str, Any]) -> dict[str, Any]:
        did = str(uuid.uuid4())
        ship_id = payload["ship_id"]
        dtype = payload["type"]
        body = payload.get("payload") or {}
        with self.session_factory() as session:
            row = DirectiveRow(
                uuid=did,
                ship_id=ship_id,
                directive_type=dtype,
                payload_json=json.dumps(body),
                status="pending",
            )
            session.add(row)
            session.commit()
        with self.lock:
            ship = self.ships.get(ship_id)
            if ship:
                ship["directive_pending"] = did
        return {"uuid": did, "status": "pending"}

    def captain_respond(self, directive_uuid: str, response: str, note: str | None) -> None:
        captured: dict[str, Any] | None = None
        with self.session_factory() as session:
            row = session.query(DirectiveRow).filter_by(uuid=directive_uuid).one_or_none()
            if not row:
                return
            row.captain_response = response
            if response == "ACCEPT":
                row.status = "accepted"
            elif response == "ESCALATE_DISTRESS":
                row.status = "escalated"
            session.commit()
            captured = {
                "ship_id": row.ship_id,
                "directive_type": row.directive_type,
                "payload": json.loads(row.payload_json),
                "response": response,
            }
        if not captured:
            return
        with self.lock:
            if captured["response"] == "ACCEPT":
                self._apply_directive(
                    captured["ship_id"],
                    captured["directive_type"],
                    captured["payload"],
                )
            elif captured["response"] == "ESCALATE_DISTRESS":
                self._log_distress(
                    captured["ship_id"],
                    note or "Captain escalated directive",
                    directive_uuid,
                )
            ship = self.ships.get(captured["ship_id"])
            if ship:
                ship["directive_pending"] = None

    def _apply_directive(self, ship_id: str, dtype: str, payload: dict[str, Any]) -> None:
        ship = self.ships.get(ship_id)
        if not ship:
            return
        if dtype == "reroute_port":
            ship["destination_id"] = payload["port_id"]
            ship["_divert_waypoint"] = None
            ship["holding"] = False
            self.compute_route_profiles(ship_id)
            self.select_route_variant(ship_id, ship.get("selected_route_profile") or "safest")
        elif dtype == "divert_waypoint":
            ship["_divert_waypoint"] = list(payload["position"])
            ship["holding"] = False
            self.compute_route_profiles(ship_id)
            self.select_route_variant(ship_id, ship.get("selected_route_profile") or "safest")
        elif dtype == "hold":
            ship["holding"] = True
            ship["status"] = "stopped"
        ship["status"] = "normal" if dtype != "hold" else "stopped"

    def _log_distress(self, ship_id: str, text: str, directive_uuid: str | None) -> None:
        from ai_distress import parse_distress_message

        structured = parse_distress_message(
            text,
            groq_api_key=self.groq_key,
            groq_model=self.groq_model,
            openai_api_key=self.openai_key,
            openai_model=self.openai_model,
        )
        aid = str(uuid.uuid4())
        with self.session_factory() as session:
            session.add(
                DistressRow(
                    uuid=aid,
                    ship_id=ship_id,
                    directive_uuid=directive_uuid,
                    raw_text=text,
                    structured_json=json.dumps(structured),
                ),
            )
            session.commit()
        ship = self.ships.get(ship_id)
        if ship:
            ship["status"] = "distressed"
        self._emit_alert(
            kind="distress",
            ship_id=ship_id,
            title=f"Distress — {ship_id}",
            body=structured.get("issue_summary", text)[:400],
            severity=float(structured.get("recommended_priority_score", 80)),
        )

    def acknowledge_alert(self, alert_uuid: str) -> None:
        with self.session_factory() as session:
            row = session.query(AlertRow).filter_by(uuid=alert_uuid).one_or_none()
            if row:
                row.acknowledged = True
                session.commit()

    def clear_alert(self, alert_uuid: str) -> None:
        with self.session_factory() as session:
            row = session.query(AlertRow).filter_by(uuid=alert_uuid).one_or_none()
            if row:
                row.cleared = True
                session.commit()

    def send_freeform_distress(self, ship_id: str, text: str) -> None:
        self._log_distress(ship_id, text, None)

    def record_assistance(self, payload: dict[str, Any]) -> None:
        with self.session_factory() as session:
            session.add(
                AssistanceRow(
                    uuid=str(uuid.uuid4()),
                    requesting_ship_id=payload["requesting_ship_id"],
                    target_ship_id=payload.get("target_ship_id"),
                    aid_type=payload["aid_type"],
                    status=payload.get("status", "pending"),
                    rationale=payload.get("rationale"),
                ),
            )
            session.commit()

    def respond_assistance(self, uuid_str: str, status: str) -> None:
        with self.session_factory() as session:
            row = session.query(AssistanceRow).filter_by(uuid=uuid_str).one_or_none()
            if row:
                row.status = status
                session.commit()

    def advisor_feedback(self, uuid_str: str, status: str) -> None:
        with self.session_factory() as session:
            row = session.query(AdvisorSuggestionRow).filter_by(uuid=uuid_str).one_or_none()
            if row:
                row.status = status
                session.commit()

    def history_window(self) -> list[dict]:
        from config import Config

        now = time.time()
        with self.session_factory() as session:
            rows = (
                session.query(FleetSnapshot)
                .filter(FleetSnapshot.ts_unix >= now - Config.HISTORY_RETENTION_SECONDS)
                .order_by(FleetSnapshot.ts_unix.asc())
                .all()
            )
            return [{"ts": r.ts_unix, "payload": json.loads(r.payload_json)} for r in rows]
