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
from ..providers import google_weather, open_meteo
from ..model import profile as vprofile, solar
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


class ModelInsights(BaseModel):
    """Modello Zerotermico v0 — profile/radiation diagnostics for the route."""
    source: str                            # "open-meteo (icon/gfs)" | "mock"
    zero_termico_m: Optional[int] = None   # from the profile; None = column below 0°C
    colonna_sotto_zero: bool = False
    inversione: bool = False               # valley inversion detected in the column
    inversione_strati: list[str] = []      # human-readable layers
    cloud_cover: float = 0.0
    #: aspect → first warming instant (ISO UTC) or None (never above threshold).
    #: Computed only when the route has a known max_slope_deg — never invented.
    warming_onset: dict[str, Optional[datetime]] = {}


class RouteWeather(BaseModel):
    route_id: str
    points: list[RoutePointWeather]
    model: Optional[ModelInsights] = None  # None = column unavailable (fail-safe)
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


def _model_insights(route: dict, samples, column) -> ModelInsights:
    """Diagnostics from the vertical column + solar geometry (pure model.*)."""
    fl = vprofile.freezing_levels(column.levels)
    inversions = vprofile.detect_inversions(column.levels)
    # Warming hour per aspect: only with a KNOWN slope (never invented) and
    # only for the route's stated aspects, at the mid-ascent point.
    warming: dict[str, datetime | None] = {}
    slope = route.get("max_slope_deg")
    if slope:
        ref = samples[len(samples) // 2][1]  # mid point of the sampled trio
        today = datetime.now(timezone.utc)
        for aspect in route.get("primary_aspects") or []:
            try:
                warming[aspect] = solar.warming_onset_utc(
                    ref["lat"], ref["lon"], today, float(slope), aspect,
                    altitude_m=float(ref["ele"]), cloud_cover=column.cloud_cover,
                )
            except ValueError:
                continue  # unknown aspect string: skip, don't guess
    return ModelInsights(
        source=column.source,
        zero_termico_m=round(fl.principal_m) if fl.principal_m is not None else None,
        colonna_sotto_zero=fl.entirely_below_zero,
        inversione=bool(inversions),
        inversione_strati=[
            f"{i.base_m:.0f}-{i.top_m:.0f} m (+{i.strength_c:.1f}°C)" for i in inversions
        ],
        cloud_cover=column.cloud_cover,
        warming_onset=warming,
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

    # Vertical column (Modello v0). One column serves the whole route (points
    # are within a few km). Fail-safe: unavailable column → model=None.
    column = None
    try:
        mid = samples[len(samples) // 2][1]
        column = open_meteo.fetch_column(mid["lat"], mid["lon"])
    except open_meteo.ColumnFetchError:
        column = None

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
        # Modello v0: temperature at the point's REAL elevation from the
        # actual column (beats grid-surface temp); source discloses the chain.
        if column is not None:
            try:
                t_profile = vprofile.temp_at(column.levels, float(ele))
                fl = vprofile.freezing_levels(column.levels)
                fc = fc.model_copy(update={
                    "temp_c": round(t_profile, 1),
                    "freezing_level_m": (round(fl.principal_m)
                                         if fl.principal_m is not None
                                         else fc.freezing_level_m),
                    "source": f"{fc.source} + profilo {column.source}",
                })
            except vprofile.ProfileError:
                pass  # point outside the column: keep provider values
        points.append(RoutePointWeather(
            label=label, lat=p["lat"], lon=p["lon"], ele_m=ele, forecast=fc,
        ))

    return RouteWeather(
        route_id=route["slug"], points=points,
        model=_model_insights(route, samples, column) if column else None,
        is_demo=not live, generated_at=datetime.now(timezone.utc),
    )
