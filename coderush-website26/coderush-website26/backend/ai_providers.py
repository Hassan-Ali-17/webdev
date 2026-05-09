"""LLM routing: OpenAI (bonus) vs Groq vs heuristic."""

from __future__ import annotations

import os


def resolve_ai_priority() -> str:
    raw = os.environ.get("AI_PROVIDER", "auto").strip().lower()
    if raw in {"openai", "groq", "auto"}:
        return raw
    return "auto"


def pick_llm_attempt_order(
    priority: str,
    *,
    has_openai: bool,
    has_groq: bool,
) -> list[str]:
    if priority == "openai":
        return ["openai"] + (["groq"] if has_groq else []) + ["heuristic"]
    if priority == "groq":
        return ["groq"] + (["openai"] if has_openai else []) + ["heuristic"]
    # auto: prefer OpenAI when configured (bonus), else Groq
    if has_openai:
        return ["openai"] + (["groq"] if has_groq else []) + ["heuristic"]
    if has_groq:
        return ["groq"] + ["heuristic"]
    return ["heuristic"]
