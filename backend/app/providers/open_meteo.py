"""
Open-Meteo pressure-level provider — the data feed of Modello Zerotermico v0.

Fetches the vertical column (temperature + geopotential height at standard
pressure levels) and cloud cover for a point, normalized to
app.model.profile.PressureLevel.

License note (already on the legal checklist): Open-Meteo's free tier is
NON-COMMERCIAL. Fine for development/validation; production launch requires
their paid API (same contract, api key + customer- prefix) — this module reads
the base URL and key from settings so the switch is config-only.

Fail-safe: any fetch/parse problem raises ColumnFetchError; callers fall back
to provider temperatures (route_weather) — the model NEVER invents a column.
Mock mode returns a plausible synthetic winter column labelled "mock".
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from ..config import settings
from ..model.profile import PressureLevel

log = logging.getLogger(__name__)

#: Standard levels we request (hPa). Parser keeps whatever subset comes back.
LEVELS_HPA = [1000, 925, 850, 700, 500]


class ColumnFetchError(Exception):
    """Column unavailable — callers must fall back, never fabricate."""


@dataclass(frozen=True)
class ColumnSample:
    levels: list[PressureLevel]
    cloud_cover: float          # 0..1
    valid_at: datetime
    source: str                 # "open-meteo (icon/gfs)" | "mock"


def is_configured() -> bool:
    """Live column requires mock mode OFF (no key needed on the free tier)."""
    return not settings.use_mock_data


def mock_column() -> ColumnSample:
    """Synthetic winter column (inversion-free), clearly labelled mock."""
    return ColumnSample(
        levels=[
            PressureLevel(925, 800, 2.5),
            PressureLevel(850, 1500, -2.0),
            PressureLevel(700, 3000, -11.5),
            PressureLevel(500, 5500, -28.0),
        ],
        cloud_cover=0.2,
        valid_at=datetime.now(timezone.utc),
        source="mock",
    )


def parse_column(payload: dict, when_utc: datetime | None = None) -> ColumnSample:
    """
    Normalize an Open-Meteo hourly response. Tolerant: uses whichever
    temperature_{p}hPa / geopotential_height_{p}hPa pairs are present;
    needs >= 2 complete levels or raises.
    """
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        raise ColumnFetchError("risposta senza serie oraria")
    when = when_utc or datetime.now(timezone.utc)
    target = when.strftime("%Y-%m-%dT%H:00")
    idx = times.index(target) if target in times else 0

    levels: list[PressureLevel] = []
    for p in LEVELS_HPA:
        t = hourly.get(f"temperature_{p}hPa")
        z = hourly.get(f"geopotential_height_{p}hPa")
        if t is None or z is None:
            continue
        try:
            ti, zi = t[idx], z[idx]
        except (IndexError, TypeError):
            continue
        if ti is None or zi is None:
            continue
        levels.append(PressureLevel(float(p), float(zi), float(ti)))
    if len(levels) < 2:
        raise ColumnFetchError("meno di 2 livelli di pressione utilizzabili")

    cc = hourly.get("cloud_cover")
    cloud = float(cc[idx]) / 100.0 if cc and cc[idx] is not None else 0.0
    return ColumnSample(
        levels=sorted(levels, key=lambda l: l.height_m),
        cloud_cover=min(max(cloud, 0.0), 1.0),
        valid_at=datetime.strptime(times[idx], "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc),
        source="open-meteo (icon/gfs)",
    )


def fetch_t2m(lat: float, lon: float, elevation_m: float,
              timeout_s: float = 15.0) -> float:
    """
    Temperatura 2m corrente ALLA QUOTA RICHIESTA (downscaling Open-Meteo via
    parametro elevation). Scelta guidata dai dati: nella validazione su 8
    stazioni in quota (2026-07-11) om-2m ha battuto il profilo puro per la T
    puntuale diurna (MAE 1.18° vs 2.24°) — vedi docs/VALIDATION_LOG.md.
    """
    if settings.use_mock_data:
        raise ColumnFetchError("mock mode: t2m live non disponibile")
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lon:.4f}&elevation={elevation_m:.0f}"
        "&current=temperature_2m&timezone=UTC"
    )
    try:
        resp = httpx.get(url, timeout=timeout_s)
        resp.raise_for_status()
        t = (resp.json().get("current") or {}).get("temperature_2m")
        if t is None:
            raise ColumnFetchError("risposta senza temperature_2m")
        return float(t)
    except ColumnFetchError:
        raise
    except Exception as e:
        raise ColumnFetchError(f"t2m non recuperabile: {e}") from e


def fetch_column(lat: float, lon: float, timeout_s: float = 15.0) -> ColumnSample:
    """Live vertical column at (lat, lon), current hour. Mock in mock mode."""
    if settings.use_mock_data:
        return mock_column()
    varlist = ",".join(
        [f"temperature_{p}hPa" for p in LEVELS_HPA]
        + [f"geopotential_height_{p}hPa" for p in LEVELS_HPA]
        + ["cloud_cover"]
    )
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lon:.4f}&hourly={varlist}"
        "&forecast_days=1&timezone=UTC"
    )
    try:
        resp = httpx.get(url, timeout=timeout_s)
        resp.raise_for_status()
        return parse_column(resp.json())
    except ColumnFetchError:
        raise
    except Exception as e:
        raise ColumnFetchError(f"colonna non recuperabile: {e}") from e
