from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class ScenarioConfig:
    raw: dict[str, Any]

    @property
    def bounding_box(self) -> dict[str, float]:
        return dict(self.raw["boundingBox"])

    @property
    def navigable_water(self) -> list[list[float]]:
        return list(self.raw["navigableWater"])

    @property
    def ports(self) -> list[dict[str, Any]]:
        return list(self.raw["ports"])

    @property
    def fleet(self) -> list[dict[str, Any]]:
        return list(self.raw["fleet"])


def load_fleet_json(path: str | Path) -> ScenarioConfig:
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    fleet = data.get("fleet") or []
    if len(fleet) != 15:
        raise ValueError(f"fleet.json must contain exactly 15 ships, got {len(fleet)}")
    return ScenarioConfig(raw=data)


def ports_by_id(cfg: ScenarioConfig) -> dict[str, dict]:
    return {p["id"]: p for p in cfg.ports}
