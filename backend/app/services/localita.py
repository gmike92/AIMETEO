"""
Ricerca località — "cerca un paese, vedi la settimana e cosa fare vicino".

  GET /localita/search?q=vezza      → geocoding (Open-Meteo, gratuito)
  GET /localita/settimana?lat&lon&ele → punteggio 0-100 per giorno (riusa lo
                                        scoring della finestra migliore)
  GET /localita/vicino?lat&lon      → itinerari e falesie entro il raggio,
                                        ordinati per distanza (haversine)

Regole di casa: coordinate SOLO dal geocoder o dal nostro DB — mai inventate.
Mock mode: le "località" sono i centroidi delle nostre aree (dati reali del DB),
source="mock" dichiarato.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import settings
from .. import store
from .best_window import DayScore, _fetch_week, _mock_week, _hourly_penalty, \
    HOUR_FROM, HOUR_TO
from .crags import load_crags

router = APIRouter(prefix="/localita", tags=["localita"])

GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_GEOCODING_API = "https://nominatim.openstreetmap.org/reverse"
#: Nominatim policy richiede uno User-Agent identificabile (mai un browser
#: finto) — niente email personale qui dentro, solo il repo del progetto.
REVERSE_UA = "AIMETEO-Zerotermico/1.0 (+https://github.com/gmike92/AIMETEO)"


class Place(BaseModel):
    name: str
    admin: Optional[str] = None      # provincia/regione dal geocoder
    lat: float
    lon: float
    elevation_m: Optional[int] = None
    source: str                      # "open-meteo geocoding" | "mock"


class ReverseGeo(BaseModel):
    name: Optional[str] = None   # nome del centro abitato SOLO se il punto ci
    # cade dentro (city/town/village/hamlet di Nominatim) — mai un nome di
    # feature naturale o di via presi a caso: se non c'è un vero centro
    # abitato resta None e il frontend degrada a lat/lon (mai inventato).
    admin: Optional[str] = None
    source: str


class NearItem(BaseModel):
    kind: str                        # "itinerario" | "falesia"
    slug: str
    name: str
    distance_km: float
    ele_m: Optional[int] = None
    activity: Optional[str] = None
    diff_grade: Optional[str] = None
    aspect: Optional[str] = None


class WeekResponse(BaseModel):
    source: str
    quota_m: int
    giorni: list[DayScore]
    generated_at: datetime


def _hav_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (lat1, lon1, lat2, lon2))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _route_point(route: dict) -> Optional[tuple[float, float]]:
    """Punto rappresentativo REALE (partenza) o None: mai coordinate inventate."""
    if route.get("start_lat") is not None and route.get("start_lon") is not None:
        return float(route["start_lat"]), float(route["start_lon"])
    pts = route.get("track_points") or []
    if pts:
        return float(pts[0]["lat"]), float(pts[0]["lon"])
    return None


@router.get("/search", response_model=list[Place])
def search(q: str = Query(min_length=2, max_length=80)) -> list[Place]:
    if settings.use_mock_data:
        # centroidi delle nostre aree (medie dei punti di partenza reali)
        out: list[Place] = []
        by_area: dict[str, list[tuple[float, float]]] = {}
        try:
            names = {a["id"]: a["name"] for a in store.list_areas()}
        except AttributeError:
            names = {}
        for r in store.list_routes():
            p = _route_point(r)
            if p:
                by_area.setdefault(r["area_id"], []).append(p)
                names.setdefault(r["area_id"], r["area_id"])
        for aid, pts in by_area.items():
            nm = names[aid]
            if q.lower() not in nm.lower() and q.lower() not in aid.lower():
                continue
            out.append(Place(
                name=nm, admin="area demo",
                lat=sum(p[0] for p in pts) / len(pts),
                lon=sum(p[1] for p in pts) / len(pts),
                source="mock",
            ))
        return out

    try:
        r = httpx.get(f"{GEOCODING_API}", params={
            "name": q, "count": 6, "language": "it"}, timeout=10.0)
        r.raise_for_status()
        results = r.json().get("results") or []
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Geocoding non disponibile ({e}). Riprova.")
    return [
        Place(
            name=x.get("name", "?"),
            admin=", ".join(filter(None, [x.get("admin2"), x.get("admin1")])) or None,
            lat=float(x["latitude"]), lon=float(x["longitude"]),
            elevation_m=(round(x["elevation"]) if x.get("elevation") is not None else None),
            source="open-meteo geocoding",
        )
        for x in results
        if x.get("latitude") is not None and x.get("longitude") is not None
    ]


@router.get("/reverse", response_model=ReverseGeo)
def reverse(lat: float, lon: float) -> ReverseGeo:
    """Nome del centro abitato sotto un punto (spillo piazzato con un click
    sulla mappa) — o niente, se il punto è su terreno non abitato: non è un
    errore, è l'esito onesto (il frontend mostra lat/lon in quel caso)."""
    try:
        r = httpx.get(REVERSE_GEOCODING_API, params={
            "format": "jsonv2", "lat": lat, "lon": lon, "zoom": 14, "addressdetails": 1,
        }, headers={"User-Agent": REVERSE_UA}, timeout=8.0)
        r.raise_for_status()
        addr = (r.json() or {}).get("address") or {}
    except Exception:  # noqa: BLE001
        return ReverseGeo(source="nominatim")
    # SOLO un vero centro abitato (city/town/village/hamlet — nodi OSM
    # place=*): niente "municipality", che è il comune amministrativo che
    # contiene il punto ed esiste per QUALSIASI coordinata in Italia, anche
    # in mezzo a un ghiacciaio — userebbe il suo nome ovunque, non solo
    # sopra un paese vero.
    name = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("hamlet")
    admin = addr.get("state") or addr.get("county")
    return ReverseGeo(name=name, admin=admin, source="nominatim")


@router.get("/settimana", response_model=WeekResponse)
def settimana(lat: float, lon: float, ele: int = 0) -> WeekResponse:
    mock = settings.use_mock_data
    hourly = _mock_week(f"{lat:.3f},{lon:.3f}") if mock else _fetch_week(lat, lon, ele)
    times = hourly["time"]
    n = len(times)

    def col(name, default=0.0):
        v = hourly.get(name) or []
        return [float(x) if x is not None else default for x in v] + \
               [default] * (n - len(v))

    temp, prec = col("temperature_2m"), col("precipitation")
    wind, gust = col("wind_speed_10m"), col("wind_gusts_10m")
    cloud, fl = col("cloud_cover"), col("freezing_level_height", 9999.0)

    days: dict[str, list[int]] = {}
    for i, t in enumerate(times):
        d, hh = t[:10], int(t[11:13])
        if HOUR_FROM <= hh <= HOUR_TO:
            days.setdefault(d, []).append(i)
    giorni = []
    for d, idxs in days.items():
        pens = [_hourly_penalty(prec[i], wind[i], gust[i], cloud[i],
                                temp[i], fl[i] < ele) for i in idxs]
        giorni.append(DayScore(
            data=d,
            punteggio=max(0, round(100 - sum(pens) / len(pens))),
            precip_mm=round(sum(prec[i] for i in idxs), 1),
            vento_max_kmh=round(max(gust[i] for i in idxs)),
            temp_min_c=round(min(temp[i] for i in idxs), 1),
            temp_max_c=round(max(temp[i] for i in idxs), 1),
            nuvole_pct=round(sum(cloud[i] for i in idxs) / len(idxs)),
            zero_termico_sotto_vetta=any(fl[i] < ele for i in idxs),
        ))
    if not giorni:
        raise HTTPException(503, "Serie meteo vuota.")
    return WeekResponse(
        source="mock" if mock else "open-meteo (icon/gfs)",
        quota_m=ele, giorni=sorted(giorni, key=lambda g: g.data),
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/vicino", response_model=list[NearItem])
def vicino(lat: float, lon: float, max_km: float = 25.0,
           limit: int = 20) -> list[NearItem]:
    out: list[NearItem] = []
    for r in store.list_routes():
        p = _route_point(r)
        if not p:
            continue  # senza coordinate reali niente distanza (mai stimata)
        d = _hav_km(lat, lon, p[0], p[1])
        if d <= max_km:
            out.append(NearItem(
                kind="itinerario", slug=r["slug"], name=r["name"],
                distance_km=round(d, 1), ele_m=r.get("max_altitude_m"),
                activity=r.get("activity"), diff_grade=r.get("diff_grade"),
            ))
    for c in load_crags():
        d = _hav_km(lat, lon, c["lat"], c["lon"])
        if d <= max_km:
            out.append(NearItem(
                kind="falesia", slug=c["slug"], name=c["name"],
                distance_km=round(d, 1), ele_m=c.get("ele_m"),
                aspect=c.get("aspect"),
            ))
    out.sort(key=lambda x: x.distance_km)
    return out[:limit]
