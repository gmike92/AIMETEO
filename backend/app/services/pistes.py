"""
Piste da sci (discesa + fondo) — geometrie reali da OpenStreetMap (ODbL),
importate offline via scripts/import_osm_pistes.py in route-db/pistes.json.

GET /pistes → elenco linee con difficoltà, per il layer mappa "Piste"/
             "Sci fondo". Nessun calcolo qui: solo lettura e serializzazione
             (niente meteo/neve — quello arriva in una fase successiva).
"""
from __future__ import annotations

import json
import pathlib
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/pistes", tags=["pistes"])

_PISTES_FILE = pathlib.Path(__file__).resolve().parents[3] / "route-db" / "pistes.json"


def load_pistes() -> list[dict]:
    try:
        return json.loads(_PISTES_FILE.read_text(encoding="utf-8")).get("pistes", [])
    except FileNotFoundError:
        return []


class Piste(BaseModel):
    slug: str
    name: str
    area_id: str
    kind: str                       # "downhill" | "nordic"
    difficulty: Optional[str] = None  # tag OSM piste:difficulty, verbatim o None
    coords: list[list[float]]       # [[lat, lon], ...] — verbatim dalla geometria OSM
    source: Optional[str] = None
    source_url: Optional[str] = None
    verified_at: Optional[str] = None


@router.get("", response_model=list[Piste])
def list_pistes() -> list[Piste]:
    return [Piste(**p) for p in load_pistes()]
