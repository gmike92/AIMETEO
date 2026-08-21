"""
Google Maps Weather API provider (roadmap #3).

GET {WEATHER_API_BASE}/currentConditions:lookup?key=...&location.latitude=..&location.longitude=..
Normalizes the response into our PointForecast contract.

Provenance rules:
- Everything numeric is verbatim from the API, except `freezing_level_m`, which the
  API does not provide: it is DERIVED from the on-site temperature and altitude with
  the standard atmosphere lapse rate (6.5 °C/km) and the source string says so.
  Derivation is standard meteorology, not invention — but it is disclosed.
- Any fetch/parse problem raises ForecastFetchError. Callers fail safe (planner
  keeps routes blocked/disclosed, endpoint returns 503) — never a silent guess.

Caching: in-process TTL cache keyed on a coordinate geohash (~1.1 km grid), plus
write-through to the Postgres forecast_cache table when a DB is configured, so
Cloud Run instances share a cache and we keep an auditable forecast history.
"""
from __future__ import annotations
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional
import httpx
from ..config import settings
from ..models import PointForecast

log = logging.getLogger(__name__)

#: Standard-atmosphere lapse rate, °C per metre.
LAPSE_RATE_C_PER_M = 0.0065

SOURCE = "google-maps-weather"
DERIVED_NOTE = "freezing_level derivato (gradiente standard 6.5°C/km)"


class ForecastFetchError(Exception):
    """The live forecast could not be retrieved or parsed. Callers fail safe."""


def is_configured() -> bool:
    return bool(settings.maps_weather_api_key) and not settings.use_mock_data


def _geohash(lat: float, lon: float) -> str:
    """~1 km spatial cache key (0.01° grid) — matches forecast_cache.geohash."""
    return f"{round(lat, 2):.2f},{round(lon, 2):.2f}"


# ── In-process TTL cache ────────────────────────────────────────────
_cache: dict[str, tuple[float, PointForecast]] = {}


def _cache_get(key: str) -> Optional[PointForecast]:
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    _cache.pop(key, None)
    return None


def _cache_put(key: str, fc: PointForecast) -> None:
    _cache[key] = (time.monotonic() + settings.forecast_cache_ttl_min * 60, fc)


def _db_cache_put(key: str, fc: PointForecast) -> None:
    """Write-through to forecast_cache (best-effort; never blocks the response)."""
    if not settings.database_url:
        return
    try:
        from .. import db
        with db.cursor() as cur:
            cur.execute(
                """INSERT INTO forecast_cache (geohash, valid_at, payload, source)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (geohash, valid_at, source) DO NOTHING""",
                (key, fc.valid_at, json.dumps(fc.model_dump(mode="json")), SOURCE),
            )
    except Exception as e:  # cache is an optimization, not a dependency
        log.warning("forecast_cache write skipped: %s", e)


def freezing_level_from_temp(temp_c: float, altitude_m: int) -> int:
    """Zero termico from on-site temp via standard lapse rate. Floor at 0."""
    return max(0, round(altitude_m + temp_c / LAPSE_RATE_C_PER_M))


def normalize(payload: dict, lat: float, lon: float,
              altitude_m: int) -> tuple[PointForecast, float]:
    """Map a currentConditions:lookup response to (PointForecast, temp_change_24h_c)."""
    try:
        temp_c = float(payload["temperature"]["degrees"])
        wind = payload.get("wind", {})
        precip = payload.get("precipitation", {})
        history = payload.get("currentConditionsHistory", {})
        return PointForecast(
            lat=lat, lon=lon,
            valid_at=datetime.fromisoformat(
                payload["currentTime"].replace("Z", "+00:00")
            ) if "currentTime" in payload else datetime.now(timezone.utc),
            temp_c=temp_c,
            freezing_level_m=freezing_level_from_temp(temp_c, altitude_m),
            wind_avg_kmh=round(float(wind.get("speed", {}).get("value", 0))),
            wind_gust_kmh=round(float(
                wind.get("gust", {}).get("value")
                or wind.get("speed", {}).get("value", 0)
            )),
            precip_mm=float(precip.get("qpf", {}).get("quantity", 0.0)),
            thunderstorm_prob=float(payload.get("thunderstormProbability", 0)) / 100.0,
            source=f"{SOURCE} · {DERIVED_NOTE}",
        ), float(history.get("temperatureChange", {}).get("degrees", 0.0))
    except ForecastFetchError:
        raise
    except Exception as e:
        raise ForecastFetchError(f"risposta meteo non valida: {e}") from e


def fetch_point(lat: float, lon: float, altitude_m: int = 0,
                timeout_s: float = 15.0) -> tuple[PointForecast, float]:
    """
    Live point forecast. Returns (PointForecast, temp_change_24h_c).
    `altitude_m` = elevation of the point, used ONLY for the derived freezing level.
    Raises ForecastFetchError on any failure — never returns invented numbers.
    """
    if not is_configured():
        raise ForecastFetchError(
            "Maps Weather API non configurata (MAPS_WEATHER_API_KEY / USE_MOCK_DATA)"
        )
    key = _geohash(lat, lon)
    cached = _cache_get(key)
    if cached is not None:
        return cached, 0.0  # temp-change only needed at fetch time for filters
    url = f"{settings.weather_api_base}/currentConditions:lookup"
    try:
        resp = httpx.get(
            url,
            params={
                "key": settings.maps_weather_api_key,
                "location.latitude": lat,
                "location.longitude": lon,
            },
            timeout=timeout_s,
        )
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        raise ForecastFetchError(f"fetch meteo fallito: {e}") from e
    fc, temp_change = normalize(payload, lat, lon, altitude_m)
    _cache_put(key, fc)
    _db_cache_put(key, fc)
    return fc, temp_change
