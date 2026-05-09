from __future__ import annotations


def propose_helpers(ships_snapshot: dict, requesting_id: str, *, nm_radius: float = 120.0) -> list[dict]:
    from geo_utils import nautical_miles

    req = ships_snapshot.get(requesting_id)
    if not req:
        return []
    candidates = []
    for sid, snapshot in ships_snapshot.items():
        if sid == requesting_id:
            continue
        pos_b = snapshot.get("position") or snapshot.get("pos")
        if not pos_b:
            continue
        dist = nautical_miles(req["position"], pos_b)
        if dist <= nm_radius:
            candidates.append({"ship_id": sid, "name": snapshot.get("name"), "distance_nm": round(dist, 2)})
    candidates.sort(key=lambda c: c["distance_nm"])
    return candidates[:4]
