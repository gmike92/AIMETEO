"""
Forecast service (vertical-agnostic).

Live: Google Maps Weather API (providers/google_weather.py) + forecast_cache.
Mock: deterministic point forecast (USE_MOCK_DATA=true, offline dev).

`altitude_m` is the elevation of the queried point: the Weather API does not
return the freezing level, so it is derived from on-site temperature via the
standard lapse rate — the response `source` discloses this.
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from ..models import PointForecast
from ..config import settings
from ..providers import google_weather

router = APIRouter(prefix="/forecast", tags=["forecast"])


def _mock_point(lat: float, lon: float) -> PointForecast:
    return PointForecast(
        lat=lat, lon=lon, valid_at=datetime.now(timezone.utc),
        temp_c=-3.0, freezing_level_m=2100, wind_avg_kmh=25, wind_gust_kmh=55,
        precip_mm=0.0, thunderstorm_prob=0.05, source="mock",
    )


@router.get("/point", response_model=PointForecast)
def point_forecast(lat: float, lon: float, altitude_m: int = 0) -> PointForecast:
    """Current/near-term forecast for a coordinate (zero termico, wind, precip)."""
    if settings.use_mock_data:
        return _mock_point(lat, lon)
    if not google_weather.is_configured():
        # Live mode but no API key → 501, not a 500 stack trace.
        raise HTTPException(
            status_code=501,
            detail="Servizio meteo non configurato (MAPS_WEATHER_API_KEY mancante). "
                   "Imposta USE_MOCK_DATA=true per i dati dimostrativi.",
        )
    try:
        fc, _ = google_weather.fetch_point(lat, lon, altitude_m)
        return fc
    except google_weather.ForecastFetchError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Impossibile recuperare il meteo in questo momento: {e}",
        )
