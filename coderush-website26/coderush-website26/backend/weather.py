"""Open-Meteo Marine with conservative fallbacks."""

from __future__ import annotations

import threading
import time
from typing import Any

import requests

MARINE_FIELDS = ["wave_height", "wind_wave_height"]

_CACHE: dict[str, tuple[float, Any]] = {}
_LOCK = threading.Lock()


def adverse_multiplier_from_marine(snapshot: dict | None, lat: float, lng: float) -> float:  # noqa: ARG001
    """Returns fuel multiplier in [1.0, 1.35] heuristic."""
    if not snapshot:
        return 1.06
    wh = snapshot.get("wave_height_m")
    ww = snapshot.get("wind_wave_m")
    wspd = snapshot.get("wind_speed_kts")
    score = 0.0
    if wh is not None and wh >= 2.8:
        score += 2.5
    elif wh is not None and wh >= 1.5:
        score += 1.2
    if ww is not None and ww >= 2.5:
        score += 2.2
    if wspd is not None and wspd >= 35:
        score += 1.8
    elif wspd is not None and wspd >= 25:
        score += 1.1
    if score >= 5:
        return 1.30
    if score >= 3:
        return 1.20
    if score >= 1.5:
        return 1.10
    return 1.0


def fetch_marine_window(
    *,
    bbox: dict[str, float],
    url: str = "https://marine-api.open-meteo.com/v1/marine",
) -> dict[str, Any] | None:
    lat = (bbox["north"] + bbox["south"]) / 2
    lng = (bbox["east"] + bbox["west"]) / 2
    cache_key = f"{round(lat, 2)}_{round(lng, 2)}"
    with _LOCK:
        hit = _CACHE.get(cache_key)
        now = time.time()
        if hit and now - hit[0] < 300:
            return hit[1]

    params = {
        "latitude": lat,
        "longitude": lng,
        "hourly": ",".join(MARINE_FIELDS + ["wave_direction", "wind_wave_direction"]),
        "forecast_hours": "24",
        "timezone": "UTC",
        "weather_models": "ecmwf",
    }
    try:
        resp = requests.get(url, params=params, timeout=4)
        if resp.status_code != 200:
            return None
        data = resp.json()
        hourly = data.get("hourly") or {}
        wave_series = hourly.get("wave_height") or []
        wind_wave_series = hourly.get("wind_wave_height") or []
        wave = float(wave_series[0]) if wave_series else None
        wind_wave = float(wind_wave_series[0]) if wind_wave_series else None
        payload = {"wave_height_m": wave, "wind_wave_m": wind_wave}
        combined = aggregate_with_wind_estimate(payload)
        combined["bbox_center"] = [lat, lng]
        combined["source"] = "open-meteo-marine"
        with _LOCK:
            _CACHE[cache_key] = (time.time(), combined)
        return combined
    except requests.RequestException:
        return None
    except (KeyError, TypeError, IndexError, ValueError):
        return None


def aggregate_with_wind_estimate(base: dict) -> dict:
    """Approximate absence of direct winds by wave-driven proxy."""
    wh = base.get("wave_height_m") or 0.0
    ww = base.get("wind_wave_m") or 0.0
    gust_proxy = max(float(wh), float(ww)) * 12.0 + 18.0
    out = dict(base)
    out["wind_speed_kts"] = gust_proxy
    out["confidence"] = 0.72
    return out
