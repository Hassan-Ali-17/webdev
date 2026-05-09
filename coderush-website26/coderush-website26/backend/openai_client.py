"""OpenAI-compatible JSON completions for SOC NLP bonuses."""

from __future__ import annotations

import json
from typing import Any

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def chat_json_completion(
    *,
    api_key: str,
    model: str,
    system: str,
    user: str,
    max_tokens: int = 500,
    temperature: float = 0.2,
) -> dict[str, Any]:
    if not api_key or OpenAI is None:
        raise RuntimeError("openai sdk unavailable")
    client = OpenAI(api_key=api_key)
    rsp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    text = rsp.choices[0].message.content or "{}"
    return dict(json.loads(text))


def chat_text_completion(
    *,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int = 1024,
    temperature: float = 0.35,
) -> str:
    """Plain chat completion (no enforced JSON schema)."""
    if not api_key or OpenAI is None:
        raise RuntimeError("openai sdk unavailable")
    client = OpenAI(api_key=api_key)
    rsp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (rsp.choices[0].message.content or "").strip()
