from __future__ import annotations

import math
from typing import Sequence

from geo_utils import destination_point, haversine_m, point_in_polygon_latlng


def march_intersection_eta_minutes(
    start: Sequence[float],
    bearing: float,
    speed_knots: float,
    zone_polygon: list[list[float]],
    *,
    max_minutes: float = 60.0,
    step_seconds: float = 20.0,
) -> tuple[float | None, list[float]]:
    """Straight-line kinematic probe until path crosses into zone polygon."""
    if speed_knots <= 0.2:
        return None, []
    travelled = list(start)
    elapsed = 0.0
    max_seconds = max_minutes * 60
    meters_per_sec = speed_knots * 0.514444
    while elapsed <= max_seconds:
        if point_in_polygon_latlng(travelled[0], travelled[1], zone_polygon):
            return elapsed / 60.0, travelled
        dist = meters_per_sec * step_seconds
        travelled = list(destination_point(travelled, bearing, dist))
        elapsed += step_seconds
        if math.isnan(travelled[0]):
            return None, []
    return None, travelled


def fuel_shortfall_warning(
    ship: dict,
    *,
    remaining_route_nm: float,
    weather_mult_for_segment: float,
) -> tuple[bool, str | None]:
    speed = float(ship.get("speed") or 0)
    fuel = float(ship.get("fuel") or 0)
    if fuel <= 0:
        return True, "fuel depleted"
    base_rate_nm = ship.get("_fuel_efficiency_nm_per_ton", 420.0)
    try:
        base_rate_nm = float(base_rate_nm)
    except (TypeError, ValueError):
        base_rate_nm = 420.0
    feasible_nm = max(1.0, fuel * base_rate_nm / max(1.05, weather_mult_for_segment))
    if remaining_route_nm > feasible_nm + 50:
        return True, (
            f"Projected endurance {feasible_nm:.0f} nm vs {remaining_route_nm:.0f} nm remaining incl. margins"
        )
    return False, None


def collision_eta_pair(
    a: Sequence[float],
    vel_a_heading: float,
    speed_a: float,
    b: Sequence[float],
    vel_b_heading: float,
    speed_b: float,
    *,
    max_minutes: float = 25.0,
    step_seconds: float = 10.0,
) -> tuple[float | None, float]:
    knot_to_mps = 0.514444
    pa = [float(a[0]), float(a[1])]
    pb = [float(b[0]), float(b[1])]
    elapsed = 0.0
    max_secs = max_minutes * 60
    while elapsed <= max_secs:
        dist_now = haversine_m(pa, pb)
        if dist_now <= 2050:
            return elapsed / 60.0, dist_now
        pa = list(destination_point(pa, vel_a_heading, knot_to_mps * speed_a * step_seconds))
        pb = list(destination_point(pb, vel_b_heading, knot_to_mps * speed_b * step_seconds))
        elapsed += step_seconds
    return None, haversine_m(pa, pb)
