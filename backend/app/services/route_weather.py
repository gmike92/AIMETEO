"""
Meteo lungo l'itinerario (differenziante: Windy prevede alla quota del grid,
noi ai punti REALI della traccia con le loro quote vere).

GET /routes/{slug}/weather → 3 campioni: partenza, metà percorso (per distanza
cumulata), punto più alto — ognuno con la previsione alla SUA quota.
Live: Google Weather per punto (freezing level derivato alla quota reale).
Mock: valori derivati con gradiente standard dalla base demo, sorgente "mock"
dichiarata — mai spacciati per reali.
404 senza traccia ingerita: niente coordinate → niente meteo inventato.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..models import PointForecast
from ..providers import google_weather
from .. import store
from .forecast import _mock_point

router = APIRouter(prefix="/routes", tags=["routes"])

#: Standard lapse rate for the DISCLOSED mock altitude adjustment.
LAPSE = 0.0065


class RoutePointWeather(BaseModel):
    label: str            # partenza | meta | vetta
    lat: float
    lon: float
    ele_m: int            # REAL elevation from the ingested track
    forecast: PointForecast


class RouteWeather(BaseModel):
    route_id: str
    points: list[RoutePointWeather]
    is_demo: bool
    generated_at: datetime


def _hav(a: dict, b: dict) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def sample_points(route: dict) -> list[tuple[str, dict]]:
    """
    (label, track_point) for start, MID-ASCENT and highest REAL points.
    "meta" = the point on the way up whose elevation is closest to the midpoint
    between start and top (on out-and-back tracks mid-distance would fall next
    to the summit, which is useless).
    """
    pts = [p for p in route.get("track_points", [])
           if p.get("lat") is not None and p.get("ele") is not None]
    if len(pts) < 3:
        raise ValueError("no usable track")
    top_i = max(range(len(pts)), key=lambda i: pts[i]["ele"])
    top = pts[top_i]
    target = (pts[0]["ele"] + top["ele"]) / 2
    ascent = pts[: top_i + 1] or pts
    mid = min(ascent, key=lambda p: abs(p["ele"] - target))
    out: list[tuple[str, dict]] = [("partenza", pts[0])]
    if mid is not pts[0] and mid is not top:
        out.append(("meta", mid))
    if top is not pts[0]:
        out.append(("vetta", top))
    return out


def _mock_at(lat: float, lon: float, ele: int) -> PointForecast:
    """Demo forecast, altitude-adjusted with the standard lapse rate (disclosed)."""
    base = _mock_point(lat, lon)  # source="mock"
    temp = round(base.temp_c - (ele - 1500) * LAPSE, 1)
    wind = base.wind_avg_kmh + max(0, (ele - 1500)) // 150  # crude, still mock
    return PointForecast(
        lat=lat, lon=lon, valid_at=base.valid_at,
        temp_c=temp, freezing_level_m=base.freezing_level_m,
        wind_avg_kmh=int(wind), wind_gust_kmh=int(wind * 2.2),
        precip_mm=base.precip_mm, thunderstorm_prob=base.thunderstorm_prob,
        source="mock",
    )


@router.get("/{slug}/weather", response_model=RouteWeather)
def route_weather(slug: str) -> RouteWeather:
    route = store.get_route(slug)
    if not route:
        raise HTTPException(404, f"route '{slug}' not found")
    try:
        samples = sample_points(route)
    except ValueError:
        raise HTTPException(
            404, "Questo itinerario non ha ancora una traccia ingerita: "
                 "nessun meteo per punto disponibile."
        )

    live = google_weather.is_configured()
    points: list[RoutePointWeather] = []
    for label, p in samples:
        ele = round(p["ele"])
        if live:
            try:
                fc, _ = google_weather.fetch_point(p["lat"], p["lon"], ele)
            except google_weather.ForecastFetchError:
                raise HTTPException(
                    503, "Meteo live momentaneamente non disponibile. Riprova."
                )
        else:
            fc = _mock_at(p["lat"], p["lon"], ele)
        points.append(RoutePointWeather(
            label=label, lat=p["lat"], lon=p["lon"], ele_m=ele, forecast=fc,
        ))

    return RouteWeather(
        route_id=route["slug"], points=points,
        is_demo=not live, generated_at=datetime.now(timezone.utc),
    )
