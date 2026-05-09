"""
Geodesic helpers and polygon checks (WGS84 sphere).
fleet.json uses [lat, lng] throughout.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence


EARTH_RADIUS_M = 6371000.0
NM_PER_METER = 1 / 1852.0


def haversine_m(a: Sequence[float], b: Sequence[float]) -> float:
    """Distance in meters between two [lat,lng] points."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(h)))
    return EARTH_RADIUS_M * c


def bearing_deg(a: Sequence[float], b: Sequence[float]) -> float:
    """Initial bearing from a to b, degrees clockwise from north."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    brng = math.degrees(math.atan2(x, y))
    return (brng + 360) % 360


def destination_point(a: Sequence[float], bearing_degrees: float, distance_m: float) -> tuple[float, float]:
    """Return [lat,lng] after traveling distance_m meters on bearing_degrees."""
    δ = distance_m / EARTH_RADIUS_M
    θ = math.radians(bearing_degrees)
    φ1, λ1 = math.radians(a[0]), math.radians(a[1])
    φ2 = math.asin(
        math.sin(φ1) * math.cos(δ) + math.cos(φ1) * math.sin(δ) * math.cos(θ),
    )
    λ2 = λ1 + math.atan2(
        math.sin(θ) * math.sin(δ) * math.cos(φ1),
        math.cos(δ) - math.sin(φ1) * math.sin(φ2),
    )
    return math.degrees(φ2), (math.degrees(λ2) + 540) % 360 - 180


def segment_intersects_polygon(
    p1: Sequence[float],
    p2: Sequence[float],
    polygon_latlng: list[list[float]],
) -> bool:
    """Raster-style edge intersection in lon/lat plane for corridor checks (grading-level)."""
    from shapely.geometry import LineString, Polygon as ShPoly

    coords = [(c[1], c[0]) for c in polygon_latlng]
    if len(coords) < 3:
        return False
    line = LineString([(p1[1], p1[0]), (p2[1], p2[0])])
    poly = ShPoly(coords)
    return line.intersects(poly)


def point_in_polygon_latlng(lat: float, lng: float, polygon_latlng: Iterable[Sequence[float]]) -> bool:
    """Ray casting; polygon verts are [lat,lng]."""
    poly = list(polygon_latlng)
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        yi, xi = poly[i][0], poly[i][1]
        yj, xj = poly[j][0], poly[j][1]
        crosses = ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-18) + xi
        )
        if crosses:
            inside = not inside
        j = i
    return inside


def point_in_or_near_navigable(
    lat: float,
    lng: float,
    polygon_latlng: Iterable[Sequence[float]],
    *,
    pad_deg: float = 8e-5,
) -> bool:
    """Like point-in-polygon but tolerates chord segments cutting slightly outside corridor edges (~9 m)."""
    if point_in_polygon_latlng(lat, lng, polygon_latlng):
        return True
    poly = list(polygon_latlng)
    if len(poly) < 3:
        return False
    p = pad_deg
    for dlat in (-p, 0.0, p):
        for dlng in (-p, 0.0, p):
            if dlat == 0.0 and dlng == 0.0:
                continue
            if point_in_polygon_latlng(lat + dlat, lng + dlng, poly):
                return True
    return False


def line_segments(poly_latlng: list[list[float]]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    verts = [(p[1], p[0]) for p in poly_latlng]
    out: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for i in range(len(verts) - 1):
        out.append((verts[i], verts[i + 1]))
    if verts[0] != verts[-1]:
        out.append((verts[-1], verts[0]))
    else:
        for i in range(len(verts) - 2):
            out.append((verts[i], verts[i + 1]))
    return out


def route_crosses_polygon(
    route_latlng: list[list[float]],
    zone_latlng: list[list[float]],
) -> bool:
    if len(route_latlng) < 2:
        return False
    zone_edges = line_segments(zone_latlng)
    for i in range(len(route_latlng) - 1):
        p1 = route_latlng[i]
        p2 = route_latlng[i + 1]
        a = (p1[1], p1[0])
        b = (p2[1], p2[0])
        for e1, e2 in zone_edges:
            if segments_intersect_2d(a, b, e1, e2):
                return True
        if segment_intersects_polygon(p1, p2, zone_latlng):
            return True
    return False


def segments_intersect_2d(a, b, c, d) -> bool:
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    def on_segment(p, q, r):
        return (
            min(p[0], r[0]) <= q[0] <= max(p[0], r[0])
            and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])
        )

    o1 = orient(a, b, c)
    o2 = orient(a, b, d)
    o3 = orient(c, d, a)
    o4 = orient(c, d, b)

    if o1 * o2 < 0 and o3 * o4 < 0:
        return True
    eps = 1e-12
    if abs(o1) <= eps and on_segment(a, c, b):
        return True
    if abs(o2) <= eps and on_segment(a, d, b):
        return True
    if abs(o3) <= eps and on_segment(c, a, d):
        return True
    if abs(o4) <= eps and on_segment(c, b, d):
        return True
    return False


def nautical_miles(a: Sequence[float], b: Sequence[float]) -> float:
    return haversine_m(a, b) * NM_PER_METER


def estimate_eta_minutes(distance_nm: float, speed_knots: float) -> float | None:
    if speed_knots <= 0.05:
        return None
    return (distance_nm / speed_knots) * 60.0


def simplify_polyline(coords: list[list[float]], epsilon_deg: float = 0.02) -> list[list[float]]:
    if len(coords) <= 2:
        return coords
    out = [coords[0]]
    for c in coords[1:-1]:
        if nautical_miles(out[-1], c) >= epsilon_deg * 60:
            out.append(c)
    out.append(coords[-1])
    return out

