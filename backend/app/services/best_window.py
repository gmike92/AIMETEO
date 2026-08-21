"""
La finestra migliore della settimana — per itinerario.

GET /routes/{slug}/finestra → per i prossimi 7 giorni, un punteggio 0-100
per giorno ALLA QUOTA DI RIFERIMENTO REALE (la vetta della traccia ingerita)
e la finestra oraria consigliata nel giorno migliore.

Criteri (dichiarati, deterministici — niente AI sui fatti):
  · precipitazioni (peso dominante)          · vento e raffiche in vetta
  · nuvolosità                               · freddo estremo
  · zero termico sotto la vetta (neve/ghiaccio in alto fuori stagione)
  · sole sul versante (modello solare) SOLO se pendenza+esposizione sono note.

Fail-safe: meteo non recuperabile → 503, mai una finestra inventata.
Mock mode: settimana sintetica deterministica, source="mock" (il frontend
la dichiara come dimostrativa).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..model import solar
from .. import store

router = APIRouter(prefix="/routes", tags=["routes"])

#: Ore locali considerate "attività in montagna" per lo scoring.
HOUR_FROM, HOUR_TO = 7, 17
#: Sotto questa penalità oraria l'ora entra nella finestra consigliata.
WINDOW_HOURLY_PENALTY = 15.0


class DayScore(BaseModel):
    data: str                    # YYYY-MM-DD (ora locale Europe/Rome)
    punteggio: int               # 0..100
    precip_mm: float
    vento_max_kmh: float
    temp_min_c: float
    temp_max_c: float
    nuvole_pct: int
    zero_termico_sotto_vetta: bool = False


class BestWindow(BaseModel):
    route_id: str
    quota_riferimento_m: int
    source: str                  # "open-meteo (icon/gfs)" | "mock"
    giorno: str                  # YYYY-MM-DD del giorno migliore
    dalle: str                   # "HH:MM" locale
    alle: str                    # "HH:MM" locale
    punteggio: int
    motivi: list[str]
    giorni: list[DayScore]
    generated_at: datetime


def _ref_point(route: dict) -> tuple[float, float, int]:
    """(lat, lon, ele) del punto più alto REALE. Mai coordinate inventate."""
    pts = [p for p in route.get("track_points", [])
           if p.get("lat") is not None and p.get("ele") is not None]
    if pts:
        top = max(pts, key=lambda p: p["ele"])
        return float(top["lat"]), float(top["lon"]), round(top["ele"])
    if route.get("start_lat") is not None and route.get("max_altitude_m"):
        return (float(route["start_lat"]), float(route["start_lon"]),
                int(route["max_altitude_m"]))
    raise HTTPException(
        404, "Questo itinerario non ha ancora coordinate reali: "
             "nessuna finestra calcolabile.")


def _hourly_penalty(precip: float, wind: float, gust: float,
                    cloud_pct: float, temp: float, fl_below: bool) -> float:
    pen = precip * 25.0
    pen += max(0.0, wind - 20.0) * 1.2
    pen += max(0.0, gust - 50.0) * 0.8
    pen += (cloud_pct / 100.0) * 15.0
    pen += max(0.0, -(temp + 5.0)) * 2.0     # sotto i -5 °C in vetta
    if fl_below:
        pen += 8.0
    return pen


def _fetch_week(lat: float, lon: float, ele: int) -> dict:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lon:.4f}&elevation={ele}"
        "&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,"
        "cloud_cover,freezing_level_height"
        "&forecast_days=7&timezone=Europe/Rome"
    )
    try:
        r = httpx.get(url, timeout=20.0)
        r.raise_for_status()
        hourly = r.json().get("hourly") or {}
        if not hourly.get("time"):
            raise ValueError("risposta senza serie oraria")
        return hourly
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            503, f"Meteo settimanale momentaneamente non disponibile ({e}). "
                 "Riprova tra poco.")


def _mock_week(slug: str) -> dict:
    """Settimana sintetica deterministica (seed dallo slug), source=mock."""
    seed = int(hashlib.sha256(slug.encode()).hexdigest()[:8], 16)
    today = datetime.now(timezone.utc).date()
    time, temp, prec, wind, gust, cloud, fl = [], [], [], [], [], [], []
    for d in range(7):
        # ogni giorno un "carattere" pseudo-casuale ma stabile
        k = (seed >> (d * 3)) % 7
        day = today + timedelta(days=d)
        for h in range(24):
            time.append(f"{day.isoformat()}T{h:02d}:00")
            temp.append(6.0 + k - abs(h - 13) * 0.6)
            prec.append(0.0 if k < 4 else (0.8 if 12 <= h <= 16 else 0.0))
            wind.append(8.0 + k * 4 + (6 if h > 11 else 0))
            gust.append(wind[-1] * 2.0)
            cloud.append(min(95, 10 + k * 13))
            fl.append(3300.0 + k * 120)
    return {"time": time, "temperature_2m": temp, "precipitation": prec,
            "wind_speed_10m": wind, "wind_gusts_10m": gust,
            "cloud_cover": cloud, "freezing_level_height": fl}


def _sun_reason(route: dict, lat: float, lon: float, ele: int,
                day_iso: str, cloud_mean_pct: float) -> Optional[str]:
    """Orario del sole sul versante — SOLO con pendenza+esposizione note."""
    slope = route.get("max_slope_deg")
    aspects = route.get("primary_aspects") or []
    if not slope or not aspects:
        return None
    try:
        day = datetime.fromisoformat(day_iso).replace(tzinfo=timezone.utc)
        onset = solar.warming_onset_utc(
            lat, lon, day, float(slope), aspects[0],
            altitude_m=float(ele), cloud_cover=cloud_mean_pct / 100.0)
    except Exception:  # noqa: BLE001 — aspect ignoto o data malformata: niente stima
        return None
    if onset is None:
        return f"versante {aspects[0]} in ombra tutto il giorno"
    local = onset + timedelta(hours=2)  # CEST; indicativo, dichiarato locale
    return f"sole sul versante {aspects[0]} dalle {local:%H:%M} circa"


@router.get("/{slug}/finestra", response_model=BestWindow)
def best_window(slug: str) -> BestWindow:
    route = store.get_route(slug)
    if not route:
        raise HTTPException(404, f"route '{slug}' not found")
    lat, lon, ele = _ref_point(route)

    mock = settings.use_mock_data
    hourly = _mock_week(slug) if mock else _fetch_week(lat, lon, ele)
    source = "mock" if mock else "open-meteo (icon/gfs)"

    times = hourly["time"]
    n = len(times)

    def col(name, default=0.0):
        v = hourly.get(name) or []
        return [float(x) if x is not None else default for x in v] + \
               [default] * (n - len(v))

    temp, prec = col("temperature_2m"), col("precipitation")
    wind, gust = col("wind_speed_10m"), col("wind_gusts_10m")
    cloud, fl = col("cloud_cover"), col("freezing_level_height", 9999.0)

    # ── raggruppa per giorno, scoring sulle ore 7-17 locali ──────────
    days: dict[str, list[int]] = {}
    for i, t in enumerate(times):
        d, hh = t[:10], int(t[11:13])
        if HOUR_FROM <= hh <= HOUR_TO:
            days.setdefault(d, []).append(i)

    giorni: list[DayScore] = []
    penalties: dict[str, list[float]] = {}
    for d, idxs in days.items():
        pens = [_hourly_penalty(prec[i], wind[i], gust[i], cloud[i],
                                temp[i], fl[i] < ele) for i in idxs]
        penalties[d] = pens
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
        raise HTTPException(503, "Serie meteo vuota: finestra non calcolabile.")

    best = max(giorni, key=lambda g: g.punteggio)
    idxs, pens = days[best.data], penalties[best.data]

    # ── finestra: la sequenza contigua più lunga di ore "buone" ─────
    runs, cur = [], []
    for j, p in enumerate(pens):
        if p < WINDOW_HOURLY_PENALTY:
            cur.append(j)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    win = max(runs, key=len) if runs else list(range(len(idxs)))
    h0 = int(times[idxs[win[0]]][11:13])
    h1 = int(times[idxs[win[-1]]][11:13]) + 1

    motivi: list[str] = []
    motivi.append("asciutto" if best.precip_mm == 0
                  else f"{best.precip_mm} mm previsti")
    motivi.append(f"raffiche max {best.vento_max_kmh:.0f} km/h in vetta")
    motivi.append(f"nuvolosità media {best.nuvole_pct}%")
    if best.zero_termico_sotto_vetta:
        motivi.append(f"zero termico sotto i {ele} m: possibile neve/ghiaccio in alto")
    sun = _sun_reason(route, lat, lon, ele,
                      best.data, float(best.nuvole_pct))
    if sun:
        motivi.append(sun)

    return BestWindow(
        route_id=route["slug"], quota_riferimento_m=ele, source=source,
        giorno=best.data, dalle=f"{h0:02d}:00", alle=f"{h1:02d}:00",
        punteggio=best.punteggio, motivi=motivi,
        giorni=sorted(giorni, key=lambda g: g.data),
        generated_at=datetime.now(timezone.utc),
    )
