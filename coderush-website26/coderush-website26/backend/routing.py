"""Grid A* routing inside navigable polygon while avoiding restricted zones."""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass
from typing import Callable, Sequence

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from geo_utils import nautical_miles, point_in_polygon_latlng, simplify_polyline


@dataclass
class RouteCandidate:
    profile: str
    nodes: list[list[float]]
    cost_nm_equivalent: float


class GridRouter:
    def __init__(
        self,
        navigable_polygon_latlng: list[list[float]],
        bbox: dict[str, float],
        *,
        nx: int = 152,
        ny: int = 152,
    ) -> None:
        self.nav_coords = navigable_polygon_latlng
        self.nav_xy = Polygon([(lng, lat) for lat, lng in navigable_polygon_latlng])
        self.bbox = bbox
        self.nx = nx
        self.ny = ny
        self.allow_cache: dict[tuple[int, int], bool] = {}

    def _cell_center(self, i: int, j: int) -> tuple[float, float]:
        south, north = self.bbox["south"], self.bbox["north"]
        west, east = self.bbox["west"], self.bbox["east"]
        dy = (north - south) / max(self.ny - 1, 1)
        dx = (east - west) / max(self.nx - 1, 1)
        lat = south + i * dy
        lng = west + j * dx
        return lat, lng

    def _nearest_valid_idx(self, lat: float, lng: float) -> tuple[int, int] | None:
        candidates: list[tuple[float, tuple[int, int]]] = []
        for i in range(self.ny):
            for j in range(self.nx):
                key = (i, j)
                if key not in self.allow_cache:
                    self._populate_cell_allow(key)
                if self.allow_cache[key]:
                    clat, clng = self._cell_center(i, j)
                    d = nautical_miles([lat, lng], [clat, clng])
                    candidates.append((d, (i, j)))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0])
        return candidates[0][1]

    def _populate_cell_allow(self, key: tuple[int, int]) -> None:
        i, j = key
        clat, clng = self._cell_center(i, j)
        pt = Point(clng, clat)
        self.allow_cache[key] = point_in_polygon_latlng(clat, clng, self.nav_coords) and self.nav_xy.contains(
            pt.buffer(1e-6),
        )

    def _astar(
        self,
        start: tuple[int, int],
        goal: tuple[int, int],
        *,
        restricted_xy,
        restricted_list_latlng: list[list[list[float]]],
        edge_cost_mult: Callable[[float, float], float],
        timeout_nodes: int = 800_000,
    ) -> list[tuple[int, int]]:
        zones_valid = restricted_list_latlng

        def cell_clear(i: int, j: int) -> bool:
            key = (i, j)
            if key not in self.allow_cache:
                self._populate_cell_allow(key)
            if not self.allow_cache[key]:
                return False
            clat, clng = self._cell_center(i, j)
            for z in zones_valid:
                if len(z) >= 3 and point_in_polygon_latlng(clat, clng, z):
                    return False
            return True

        if not cell_clear(*start) or not cell_clear(*goal):
            return []

        open_heap: list[tuple[float, tuple[int, int]]] = []
        heapq.heappush(open_heap, (self._heur(start, goal), start))
        came: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
        g_score: dict[tuple[int, int], float] = {start: 0.0}
        visited = 0
        restricted_xy = restricted_xy  # noqa: ARG002

        while open_heap:
            visited += 1
            if visited > timeout_nodes:
                break
            _, cur = heapq.heappop(open_heap)
            if cur == goal:
                path_cells: list[tuple[int, int]] = []
                c = cur
                while c is not None:
                    path_cells.append(c)
                    c = came[c]
                path_cells.reverse()
                return path_cells

            ci, cj = cur
            neighbors = [
                (ci + 1, cj),
                (ci - 1, cj),
                (ci, cj + 1),
                (ci, cj - 1),
                (ci + 1, cj + 1),
                (ci + 1, cj - 1),
                (ci - 1, cj + 1),
                (ci - 1, cj - 1),
            ]
            for ni, nj in neighbors:
                if not (0 <= ni < self.ny and 0 <= nj < self.nx):
                    continue
                if not cell_clear(ni, nj):
                    continue
                clat_a, clng_a = self._cell_center(ci, cj)
                clat_b, clng_b = self._cell_center(ni, nj)
                dist_nm = nautical_miles([clat_a, clng_a], [clat_b, clng_b])
                mid_lat = (clat_a + clat_b) / 2
                mid_lng = (clng_a + clng_b) / 2
                w = edge_cost_mult(mid_lat, mid_lng)
                tentative = g_score[cur] + dist_nm * w
                nei = (ni, nj)
                if tentative < g_score.get(nei, math.inf):
                    came[nei] = cur
                    g_score[nei] = tentative
                    f = tentative + self._heur(nei, goal)
                    heapq.heappush(open_heap, (f, nei))
        return []

    def _heur(self, a: tuple[int, int], b: tuple[int, int]) -> float:
        la, lnga = self._cell_center(*a)
        lb, lngb = self._cell_center(*b)
        return nautical_miles([la, lnga], [lb, lngb])

    def compute_paths(
        self,
        start_latlng: Sequence[float],
        goal_latlng: Sequence[float],
        restricted_zones: list[list[list[float]]],
        weather_cost: Callable[[float, float], float],
    ) -> dict[str, RouteCandidate]:
        zones_xy_list = []
        for z in restricted_zones:
            if len(z) < 3:
                continue
            zones_xy_list.append(Polygon([(lng, lat) for lat, lng in z]))
        restricted_xy = unary_union(zones_xy_list) if zones_xy_list else None
        restricted_list_latlng = [z for z in restricted_zones if len(z) >= 3]

        self.allow_cache.clear()
        s_idx = self._nearest_valid_idx(float(start_latlng[0]), float(start_latlng[1]))
        self.allow_cache.clear()
        g_idx = self._nearest_valid_idx(float(goal_latlng[0]), float(goal_latlng[1]))

        if s_idx is None or g_idx is None:
            return {}

        def mult_fast(mlat: float, mlng: float) -> float:
            return 1.0

        def mult_safe(mlat: float, mlng: float) -> float:
            wc = weather_cost(mlat, mlng)
            if wc >= 1.25:
                return 2.8
            if wc >= 1.05:
                return 1.6
            return 1.0

        def mult_fuel(mlat: float, mlng: float) -> float:
            return weather_cost(mlat, mlng)

        profiles = {
            "fastest": mult_fast,
            "safest": mult_safe,
            "fuel_efficient": mult_fuel,
        }
        results: dict[str, RouteCandidate] = {}
        self.allow_cache.clear()
        _ = restricted_xy
        for name, fm in profiles.items():
            self.allow_cache.clear()
            cells = self._astar(
                s_idx,
                g_idx,
                restricted_xy=None,
                restricted_list_latlng=restricted_list_latlng,
                edge_cost_mult=fm,
            )
            if not cells:
                continue
            latlng_path: list[list[float]] = []
            prev = None
            for ci, cj in cells:
                coord = list(self._cell_center(ci, cj))
                if prev is None or nautical_miles(prev, coord) > 0.02:
                    latlng_path.append(coord)
                prev = coord
            latlng_path.append([float(goal_latlng[0]), float(goal_latlng[1])])
            simplified = simplify_polyline(latlng_path)
            nm_total = sum(
                nautical_miles(simplified[k], simplified[k + 1]) for k in range(len(simplified) - 1)
            )
            results[name] = RouteCandidate(
                profile=name,
                nodes=simplified,
                cost_nm_equivalent=float(nm_total),
            )
        return results
