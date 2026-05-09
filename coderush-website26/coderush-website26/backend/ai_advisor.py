from __future__ import annotations

import json
from typing import Any

from ai_providers import pick_llm_attempt_order, resolve_ai_priority

try:
    from groq import Groq
except ImportError:
    Groq = None

from openai_client import chat_json_completion


def heuristic_advisory(state_summary: dict[str, Any]) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    alerts = sorted(state_summary.get("alerts", []), key=lambda a: float(a.get("severity_score", 0)), reverse=True)
    distressed = [
        ship for ship in state_summary.get("ships", []) if str(ship.get("status")).lower() in {"distressed", "stranded"}
    ]
    for ship in distressed[:3]:
        suggestions.append(
            {
                "title": f"Assist {ship.get('shipId')} immediately",
                "rationale": f"{ship.get('name')} is {ship.get('status')} — coordinate rescue or divert traffic.",
                "action": {"type": "focus_ship", "ship_id": ship.get("shipId")},
            },
        )
    breach_alerts = [a for a in alerts if str(a.get("kind")) == "geofence_breach"]
    if breach_alerts:
        tgt = breach_alerts[0]
        suggestions.append(
            {
                "title": "Recompute routes after zone breach cluster",
                "rationale": f"{tgt.get('title')} warrants fleet-wide avoidance checks.",
                "action": {"type": "bulk_reroute_hint", "ship_id": tgt.get("ship_id")},
            },
        )
    if alerts and not suggestions:
        top = alerts[0]
        suggestions.append(
            {
                "title": "Acknowledge SOC alert backlog",
                "rationale": f"Top backlog item: {top.get('title')}",
                "action": {"type": "acknowledgement_pulse", "alert_uuid": top.get("uuid")},
            },
        )
    return suggestions[:3]


ADVISOR_SYSTEM = """You propose calm, actionable maritime SOC guidance.
Return JSON with key suggestions: array(max 4) objects {title:string, rationale:string, action:object}.
Actions may use types: reroute_ship, propose_zone_review, escalate_distress_followup."""


def groq_advisory(api_key: str, model: str, packaged: dict[str, Any]) -> list[dict[str, Any]]:
    if not api_key or Groq is None:
        raise RuntimeError("groq unavailable")
    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": ADVISOR_SYSTEM},
            {
                "role": "user",
                "content": json.dumps({"fleet_state_digest": packaged}, default=str),
            },
        ],
        temperature=0.35,
        max_tokens=600,
        response_format={"type": "json_object"},
    )
    text = completion.choices[0].message.content or "{}"
    data = json.loads(text)
    return _unpack_suggestions(data, parser_label="groq")


def openai_advisory(api_key: str, model: str, packaged: dict[str, Any]) -> list[dict[str, Any]]:
    user_payload = json.dumps({"fleet_state_digest": packaged}, default=str)
    raw = chat_json_completion(
        api_key=api_key,
        model=model,
        system=ADVISOR_SYSTEM + " Respond JSON only.",
        user=user_payload,
        max_tokens=650,
        temperature=0.35,
    )
    return _unpack_suggestions(raw, parser_label="openai")


def _unpack_suggestions(data: dict[str, Any], *, parser_label: str) -> list[dict[str, Any]]:
    sug = []
    for item in data.get("suggestions", []):
        sug.append(
            {
                "title": str(item.get("title"))[:240],
                "rationale": str(item.get("rationale"))[:520],
                "action": item.get("action") or {},
                "parser_meta": parser_label,
            },
        )
    return sug[:4]


def build_advisory(
    *,
    groq_api_key: str | None,
    groq_model: str,
    openai_api_key: str | None,
    openai_model: str,
    state_summary: dict[str, Any],
) -> list[dict[str, Any]]:
    has_o = bool(openai_api_key and openai_api_key.strip())
    has_g = bool(groq_api_key and groq_api_key.strip())
    order = pick_llm_attempt_order(resolve_ai_priority(), has_openai=has_o, has_groq=has_g)

    for backend in order:
        try:
            if backend == "openai" and has_o:
                return openai_advisory(openai_api_key or "", openai_model, state_summary)
            if backend == "groq" and has_g:
                return groq_advisory(groq_api_key or "", groq_model, state_summary)
            if backend == "heuristic":
                return heuristic_advisory(state_summary)
        except Exception:
            continue
    return heuristic_advisory(state_summary)
