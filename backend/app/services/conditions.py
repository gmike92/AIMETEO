"""
Conditions board — the meteo-first view of the product.

GET /conditions → one entry per area: the OFFICIAL avalanche bulletin in force
(never authored by us; explicit status when unavailable) plus a representative
point forecast (the trailhead of the first route in the area with real
GPX-ingested coordinates; mock and disclosed when offline/no coords).

Fail-safe by construction: a bulletin fetch problem is reported as
status="non verificabile" — never hidden, never downgraded to "no danger".
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from ..config import settings
from ..connectors import registry
from ..connectors.base import BulletinFetchError
from ..providers import google_weather
from ..models import PointForecast
from .. import store
from .forecast import _mock_point

log = logging.getLogger(__name__)
router = APIRouter(prefix="/conditions", tags=["conditions"])


class AreaBulletin(BaseModel):
    status: str                      # in_vigore | assente | non_verificabile | nessun_connettore
    danger_level: Optional[int] = None
    danger_by_aspect: dict[str, int] = {}
    service: Optional[str] = None
    issued_at: Optional[datetime] = None
    source_url: Optional[str] = None


class AreaConditions(BaseModel):
    area_id: str
    area_name: str
    region: Optional[str] = None
    bulletin: AreaBulletin
    forecast: Optional[PointForecast] = None
    forecast_route: Optional[str] = None   # slug of the route whose trailhead we used
    forecast_is_demo: bool = True
    routes_count: int = 0
    generated_at: datetime


def _area_bulletin(area: dict, cache: dict) -> AreaBulletin:
    country = area.get("country", settings.default_country)
    key = (country, area.get("avalanche_zone"), area.get("avalanche_subzone"))
    if key not in cache:
        try:
            connector = registry.get_for_country(country)
        except KeyError:
            cache[key] = AreaBulletin(status="nessun_connettore")
        else:
            try:
                b = connector.fetch(region=area.get("avalanche_zone", "UNKNOWN"),
                                    subzone=area.get("avalanche_subzone"))
                cache[key] = AreaBulletin(
                    status="assente" if b is None else "in_vigore",
                    danger_level=b.danger_level if b else None,
                    danger_by_aspect=b.danger_by_aspect if b else {},
                    service=b.avalanche_service if b else None,
                    issued_at=b.issued_at if b else None,
                    source_url=b.source_url if b else None,
                )
            except BulletinFetchError:
                cache[key] = AreaBulletin(status="non_verificabile")
    return cache[key]


def _area_forecast(routes: list[dict]) -> tuple[Optional[PointForecast], Optional[str], bool]:
    """Representative forecast: first route with real coords; else disclosed mock."""
    for r in routes:
        lat, lon = r.get("start_lat"), r.get("start_lon")
        if lat is None or lon is None:
            continue
        if google_weather.is_configured():
            try:
                pf, _ = google_weather.fetch_point(float(lat), float(lon),
                                                   int(r["start_altitude_m"]))
                return pf, r["slug"], False
            except google_weather.ForecastFetchError as e:
                log.warning("conditions: live forecast failed (%s), demo shown", e)
        pf = _mock_point(float(lat), float(lon))
        return pf, r["slug"], True
    if routes:
        return _mock_point(0.0, 0.0), None, True   # no coords in area yet
    return None, None, True


@router.get("", response_model=list[AreaConditions])
def conditions() -> list[AreaConditions]:
    now = datetime.now(timezone.utc)
    all_routes = store.list_routes()
    cache: dict = {}
    out: list[AreaConditions] = []
    for area in store.list_areas():
        area_routes = [r for r in all_routes if r.get("area_id") == area["id"]]
        fc, fc_route, is_demo = _area_forecast(area_routes)
        out.append(AreaConditions(
            area_id=area["id"], area_name=area["name"], region=area.get("region"),
            bulletin=_area_bulletin(area, cache),
            forecast=fc, forecast_route=fc_route, forecast_is_demo=is_demo,
            routes_count=len(area_routes), generated_at=now,
        ))
    return out
