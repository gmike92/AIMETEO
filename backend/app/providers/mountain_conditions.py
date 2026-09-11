"""
Neve e luce in un punto — dati che cambiano ora per ora, da Open-Meteo.

    from app.providers import mountain_conditions
    c = mountain_conditions.fetch(lat, lon)   # None se non disponibili

Perche' esiste: la relazione AI (prompts.py) aveva due buchi.
- ALBA: lo schema del piano gita chiede `timing.alba`, ma il contesto diceva
  "ALBA prevista: non disponibile" — e la regola 1 del system prompt vieta di
  inventare orari, quindi il campo usciva sempre vuoto.
- NEVE: per scialpinismo e alpinismo la neve al suolo e soprattutto la neve
  FRESCA degli ultimi giorni sono tra i dati che contano di piu', e non
  c'erano affatto.

Indipendente da PointForecast di proposito: briefing.py passa forecast=None
(la relazione del singolo itinerario non riceve alcun meteo puntuale), e il
forecast reale dipende da Google Weather, che richiede una chiave. Questo
modulo usa Open-Meteo, gratuito e senza chiave: neve e alba arrivano anche
quando Google non e' configurato.

CASI POLARI — verificati 2026-09-11 sull'archivio Open-Meteo, Lofoten (68 N):
    sole di mezzanotte (21 giu): sunrise "00:00", daylight_duration 86400 s
    notte polare       (21 dic): sunrise "00:00", daylight_duration 0 s
In ENTRAMBI i casi l'orario e' "00:00": presi alla lettera, il modello
scriverebbe "alba alle 00:00" su una notte polare. Si distinguono solo dalla
durata della luce, ed e' quella che decide qui. Lofoten e Levi sono nel
catalogo, non e' un caso di scuola.

NEVE AL SUOLO: e' il valore del modello al punto interrogato (la partenza
dell'itinerario), alla quota che Open-Meteo dichiara nella risposta — non la
neve sul pendio chiave. Il blocco in prompts.py lo dice esplicitamente.

Licenza: come providers/open_meteo.py, il tier gratuito di Open-Meteo e'
NON COMMERCIALE (gia' nella checklist legale): in produzione serve il piano a
pagamento.

Mai un dato inventato: su qualunque errore o dato mancante il campo resta
None (o fetch() restituisce None), e il chiamante scrive "non disponibile".
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from ..config import settings

log = logging.getLogger(__name__)

API = "https://api.open-meteo.com/v1/forecast"

#: Finestra della neve fresca: 72 h e' l'orizzonte che conta per il
#: pericolo da neve fresca/lastroni nei bollettini EAWS.
PAST_HOURS = 72
NEXT_HOURS = 24
#: Tolleranza sulla durata della luce per riconoscere i casi polari.
_POLAR_EPS_S = 60


@dataclass(frozen=True)
class MountainConditions:
    snow_depth_cm: Optional[float]        # al suolo ORA, al punto interrogato
    point_elevation_m: Optional[float]    # quota a cui Open-Meteo riferisce il dato
    snowfall_past72h_cm: Optional[float]  # neve fresca caduta nelle ultime 72 h
    snowfall_next24h_cm: Optional[float]  # neve prevista nelle prossime 24 h
    sunrise: Optional[str]                # "HH:MM" ora locale; None nei casi polari
    sunset: Optional[str]
    polar: Optional[str]                  # "sole_di_mezzanotte" | "notte_polare" | None
    source: str                           # "open-meteo" | "mock"


def mock_conditions() -> MountainConditions:
    """Campione invernale plausibile, etichettato mock (USE_MOCK_DATA=true)."""
    return MountainConditions(
        snow_depth_cm=85.0, point_elevation_m=1800.0,
        snowfall_past72h_cm=30.0, snowfall_next24h_cm=5.0,
        sunrise="07:45", sunset="16:50", polar=None, source="mock",
    )


def _window_sum(values: list, start: int, end: int) -> Optional[float]:
    """Somma su [start, end). None se la finestra esce dai dati o contiene un
    buco: una somma su ore mancanti sottostimerebbe la neve senza dirlo."""
    if start < 0 or end > len(values):
        return None
    window = values[start:end]
    if any(v is None for v in window):
        return None
    return round(sum(float(v) for v in window), 1)


def parse(payload: dict, now_utc: Optional[datetime] = None) -> MountainConditions:
    """Normalizza una risposta Open-Meteo (hourly snow_depth/snowfall, daily
    sunrise/sunset/daylight_duration, past_days=3, timezone=auto)."""
    offset = timedelta(seconds=payload.get("utc_offset_seconds") or 0)
    now_local = (now_utc or datetime.now(timezone.utc)) + offset
    hour_key = now_local.strftime("%Y-%m-%dT%H:00")
    day_key = now_local.date().isoformat()

    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    # Rigoroso: se l'ora corrente non c'e' non si ripiega sull'indice 0 —
    # con past_days=3 l'indice 0 e' tre giorni fa, e le somme sarebbero
    # calcolate sulla finestra sbagliata.
    idx = times.index(hour_key) if hour_key in times else None

    depth = past = nxt = None
    if idx is not None:
        sd = hourly.get("snow_depth") or []
        if idx < len(sd) and sd[idx] is not None:
            depth = round(float(sd[idx]) * 100.0, 1)  # m -> cm
        sf = hourly.get("snowfall") or []
        past = _window_sum(sf, idx - PAST_HOURS, idx)
        nxt = _window_sum(sf, idx, idx + NEXT_HOURS)

    sunrise = sunset = polar = None
    daily = payload.get("daily") or {}
    days = daily.get("time") or []
    if day_key in days:
        j = days.index(day_key)
        light = (daily.get("daylight_duration") or [None] * len(days))[j]
        if light is not None and light >= 86400 - _POLAR_EPS_S:
            polar = "sole_di_mezzanotte"
        elif light is not None and light <= _POLAR_EPS_S:
            polar = "notte_polare"
        else:
            rise = (daily.get("sunrise") or [None] * len(days))[j]
            sets = (daily.get("sunset") or [None] * len(days))[j]
            if rise:
                sunrise = rise[11:16]
            if sets:
                # Vicino al circolo polare il tramonto puo' cadere dopo la
                # mezzanotte: "00:30" senza avviso sembrerebbe un errore.
                sunset = sets[11:16] + ("" if sets[:10] == day_key else " (giorno dopo)")

    return MountainConditions(
        snow_depth_cm=depth,
        point_elevation_m=payload.get("elevation"),
        snowfall_past72h_cm=past,
        snowfall_next24h_cm=nxt,
        sunrise=sunrise, sunset=sunset, polar=polar,
        source="open-meteo",
    )


def for_route(route: dict) -> Optional[MountainConditions]:
    """Condizioni alla partenza dell'itinerario — SOLO con coordinate reali.
    Altrove nell'app un itinerario senza traccia riceve coordinate demo per
    mostrare comunque un meteo etichettato come tale; qui no: la neve di un
    punto qualsiasi presentata come neve dell'itinerario sarebbe inventata.
    Senza coordinate -> None -> "non disponibile"."""
    lat, lon = route.get("start_lat"), route.get("start_lon")
    if lat is None or lon is None:
        return None
    return fetch(float(lat), float(lon))


def fetch(lat: float, lon: float, timeout_s: float = 15.0) -> Optional[MountainConditions]:
    """Neve e luce di oggi al punto (lat, lon). Mock in mock mode, None se
    Open-Meteo non risponde — mai valori di ripiego inventati."""
    if settings.use_mock_data:
        return mock_conditions()
    url = (
        f"{API}?latitude={lat:.4f}&longitude={lon:.4f}"
        "&hourly=snow_depth,snowfall"
        "&daily=sunrise,sunset,daylight_duration"
        "&past_days=3&forecast_days=2&timezone=auto"
    )
    try:
        resp = httpx.get(url, timeout=timeout_s)
        resp.raise_for_status()
        return parse(resp.json())
    except Exception as e:  # noqa: BLE001 — la relazione prosegue senza il blocco
        log.warning("condizioni neve/luce non disponibili per %.4f,%.4f: %s", lat, lon, e)
        return None
