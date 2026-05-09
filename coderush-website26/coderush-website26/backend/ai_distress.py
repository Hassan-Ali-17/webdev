from __future__ import annotations

import json
from typing import Any

from ai_providers import pick_llm_attempt_order, resolve_ai_priority

try:
    from groq import Groq
except ImportError:
    Groq = None

from openai_client import chat_json_completion

BASE_SCHEMA = """
Return compact JSON ONLY with keys:
severity (critical|high|moderate|low),
issue_summary (string <=200 chars),
injuries_estimate (integer estimate, 0 if unknown),
damage_estimate_percent (integer 0-100, 0 unknown),
supply_chain_impact (string),
recommended_priority_score (integer 1-100, higher more urgent).
"""


def heuristic_parse_distress(text: str) -> dict[str, Any]:
    import re

    lowered = text.lower()
    severity = "moderate"
    if any(k in lowered for k in ("sinking", "fire", "mayday", "capsize", "torpedo", "attack")):
        severity = "critical"
    elif any(k in lowered for k in ("injury", "medevac", "collision", "hull breach", "flooding")):
        severity = "high"
    elif any(k in lowered for k in ("drift", "engine", "power loss", "steering loss")):
        severity = "high"
    nums = [int(x) for x in re.findall(r"\b(\d+)\b", text)]
    injuries = nums[0] if nums else 0
    damage = min(95, nums[1]) if len(nums) > 1 else 20 if "damage" in lowered else 0
    prio = {"critical": 95, "high": 80, "moderate": 55, "low": 35}.get(severity, 60)
    if "fuel" in lowered:
        prio = min(100, prio + 5)
    return {
        "severity": severity,
        "issue_summary": text[:200],
        "injuries_estimate": injuries,
        "damage_estimate_percent": damage,
        "supply_chain_impact": "Potential delay pending assessment",
        "recommended_priority_score": prio,
        "parser": "heuristic",
    }


def groq_parse_distress(api_key: str, model: str, text: str) -> dict[str, Any]:
    if not api_key or Groq is None:
        raise RuntimeError("groq unavailable")
    client = Groq(api_key=api_key)
    prompt = BASE_SCHEMA.strip() + "\nMessage:\n" + text.strip()
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You classify maritime distress chatter for SOC operators. Respond JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.15,
        "max_tokens": 400,
    }
    try:
        chat = client.chat.completions.create(**kwargs, response_format={"type": "json_object"})
    except Exception:
        chat = client.chat.completions.create(**kwargs)
    content = chat.choices[0].message.content or "{}"
    data = json.loads(content)
    data["parser"] = "groq"
    return normalize_structured_payload(data)


def openai_parse_distress(api_key: str, model: str, text: str) -> dict[str, Any]:
    user = BASE_SCHEMA.strip() + "\nMessage:\n" + text.strip()
    raw = chat_json_completion(
        api_key=api_key,
        model=model,
        system="You classify maritime distress for SOC ops. Respond with JSON matching the user's schema.",
        user=user,
        max_tokens=400,
        temperature=0.15,
    )
    data = dict(raw)
    data["parser"] = "openai"
    return normalize_structured_payload(data)


def normalize_structured_payload(data: dict[str, Any]) -> dict[str, Any]:
    sev_raw = str(data.get("severity", "moderate")).lower()
    if sev_raw not in {"critical", "high", "moderate", "low"}:
        sev_raw = "moderate"
    try:
        priority = float(data.get("recommended_priority_score", 60))
    except (TypeError, ValueError):
        priority = 60.0
    priority = max(1.0, min(100.0, priority))
    try:
        inj = int(float(data.get("injuries_estimate", 0)))
    except (TypeError, ValueError):
        inj = 0
    try:
        dmg = int(float(data.get("damage_estimate_percent", 0)))
    except (TypeError, ValueError):
        dmg = 0
    dmg = max(0, min(100, dmg))

    summary = str(data.get("issue_summary", ""))[:300]
    impact = str(data.get("supply_chain_impact", ""))
    result = dict(data)
    result.update(
        {
            "severity": sev_raw,
            "issue_summary": summary,
            "injuries_estimate": inj,
            "damage_estimate_percent": dmg,
            "supply_chain_impact": impact[:300],
            "recommended_priority_score": priority,
        },
    )
    return result


def parse_distress_message(
    text: str,
    *,
    groq_api_key: str | None,
    groq_model: str,
    openai_api_key: str | None,
    openai_model: str,
) -> dict[str, Any]:
    has_o = bool(openai_api_key and openai_api_key.strip())
    has_g = bool(groq_api_key and groq_api_key.strip())
    order = pick_llm_attempt_order(resolve_ai_priority(), has_openai=has_o, has_groq=has_g)

    last_err: Exception | None = None
    for backend in order:
        if backend == "heuristic":
            return heuristic_parse_distress(text)
        try:
            if backend == "openai" and has_o:
                return openai_parse_distress(openai_api_key or "", openai_model, text)
            if backend == "groq" and has_g:
                return groq_parse_distress(groq_api_key or "", groq_model, text)
        except Exception as exc:
            last_err = exc
            continue
    if last_err is not None:
        return heuristic_parse_distress(text)
    return heuristic_parse_distress(text)
