"""
Falesie — la domanda quotidiana dello scalatore: "è al sole o all'ombra?
E fino a quando?" Risposta dal modello solare (parete verticale = pendenza
90°), esatta al quarto d'ora, per l'esposizione REALE della parete.

GET /falesie            → elenco con stato sole/ombra ADESSO + prossima
                          transizione di oggi (+ meteo demo/live al punto)
GET /falesie/{slug}/sole → timeline oraria di oggi per la parete

Regole di sempre: esposizione ignota → niente calcolo inventato (stato
"esposizione non censita"); dati OSM attribuiti ODbL; verified_at null
finché un curatore non conferma.
"""
from __future__ import annotations

import json
import pathlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..model import solar

router = APIRouter(prefix="/falesie", tags=["falesie"])

_CRAGS_FILE = pathlib.Path(__file__).resolve().parents[3] / "route-db" / "crags.json"

#: Soglia W/m² sul piano della parete per dire "al sole" (diretta+diffusa).
SUN_THRESHOLD_WM2 = 120.0


def load_crags() -> list[dict]:
    try:
        return json.loads(_CRAGS_FILE.read_text(encoding="utf-8")).get("crags", [])
    except FileNotFoundError:
        return []


class SunWindow(BaseModel):
    dalle: Optional[datetime] = None
    alle: Optional[datetime] = None


class CragSun(BaseModel):
    slug: str
    name: str
    lat: float
    lon: float
    ele_m: Optional[int] = None
    aspect: Optional[str] = None       # esposizione parete; None = non censita
    in_sole_adesso: Optional[bool] = None   # None = non calcolabile
    finestre_sole: list[SunWindow] = []     # oggi, UTC
    nota: Optional[str] = None
    source: Optional[str] = None
    verified_at: Optional[str] = None


def _wall_irradiance(crag: dict, when: datetime) -> float:
    return solar.slope_irradiance(
        crag["lat"], crag["lon"], when,
        slope_deg=90.0, aspect=crag["aspect"],
        altitude_m=float(crag.get("ele_m") or 0),
    ).total


def sun_windows_today(crag: dict, step_min: int = 15) -> list[SunWindow]:
    """Finestre di sole di OGGI sulla parete (UTC), scansione a 15'."""
    day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    windows: list[SunWindow] = []
    open_at: Optional[datetime] = None
    for k in range(0, 24 * 60, step_min):
        t = day + timedelta(minutes=k)
        sunny = _wall_irradiance(crag, t) >= SUN_THRESHOLD_WM2
        if sunny and open_at is None:
            open_at = t
        elif not sunny and open_at is not None:
            windows.append(SunWindow(dalle=open_at, alle=t))
            open_at = None
    if open_at is not None:
        windows.append(SunWindow(dalle=open_at, alle=day + timedelta(days=1)))
    return windows


def _to_sun(crag: dict) -> CragSun:
    base = CragSun(
        slug=crag["slug"], name=crag["name"], lat=crag["lat"], lon=crag["lon"],
        ele_m=crag.get("ele_m"), aspect=crag.get("aspect"),
        source=crag.get("source"), verified_at=crag.get("verified_at"),
    )
    if not crag.get("aspect"):
        base.nota = ("Esposizione della parete non censita: sole/ombra non "
                     "calcolabile. Un curatore può aggiungerla (campo aspect).")
        return base
    try:
        now = datetime.now(timezone.utc)
        base.in_sole_adesso = _wall_irradiance(crag, now) >= SUN_THRESHOLD_WM2
        base.finestre_sole = sun_windows_today(crag)
    except ValueError:
        base.nota = f"esposizione '{crag.get('aspect')}' non riconosciuta"
    return base


@router.get("", response_model=list[CragSun])
def list_crags() -> list[CragSun]:
    return [_to_sun(c) for c in load_crags()]


@router.get("/{slug}/sole", response_model=CragSun)
def crag_sun(slug: str) -> CragSun:
    crag = next((c for c in load_crags() if c["slug"] == slug), None)
    if not crag:
        raise HTTPException(404, f"falesia '{slug}' non trovata")
    return _to_sun(crag)
