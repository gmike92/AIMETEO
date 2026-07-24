"""
Autori/curatori — profili con nome e faccia, collezioni firmate.

  GET /autori                → elenco curatori (senza dettaglio rotte)
  GET /autori/{slug}         → profilo + rotte della collezione (dal route store)

Regole di casa:
- il flag `curatore_verificato` lo assegniamo noi, mai autoproclamato;
- la collezione è una PROPOSTA firmata: la verifica del singolo itinerario
  (verified_at) resta separata e visibile;
- rotte citate ma assenti dal DB vengono semplicemente omesse (mai inventate).
"""
from __future__ import annotations

import json
import pathlib
from typing import Optional

from fastapi import APIRouter, HTTPException

from .. import store

router = APIRouter(prefix="/autori", tags=["autori"])

_FILE = pathlib.Path(__file__).resolve().parents[3] / "route-db" / "curators.json"


def _load() -> list[dict]:
    try:
        return json.loads(_FILE.read_text(encoding="utf-8")).get("curators", [])
    except FileNotFoundError:
        return []


def curator_for_route(route_slug: str) -> Optional[dict]:
    """Curatore la cui collezione include la rotta (per il credito in scheda)."""
    for c in _load():
        if route_slug in (c.get("collezione") or {}).get("routes", []):
            return {"slug": c["slug"], "name": c["name"], "ruolo": c.get("ruolo")}
    return None


@router.get("")
def list_autori() -> list[dict]:
    out = []
    for c in _load():
        coll = c.get("collezione") or {}
        out.append({
            "slug": c["slug"], "name": c["name"], "ruolo": c.get("ruolo"),
            "curatore_verificato": bool(c.get("curatore_verificato")),
            "collezione_titolo": coll.get("titolo"),
            "n_rotte": len(coll.get("routes", [])),
        })
    return out


@router.get("/{slug}")
def get_autore(slug: str) -> dict:
    cur = next((c for c in _load() if c["slug"] == slug), None)
    if not cur:
        raise HTTPException(404, f"autore '{slug}' non trovato")
    coll = cur.get("collezione") or {}
    routes = []
    for rs in coll.get("routes", []):
        r = store.get_route(rs)
        if not r:
            continue  # rotta citata ma non nel DB: omessa, mai inventata
        routes.append({
            "slug": r["slug"], "name": r["name"], "activity": r.get("activity"),
            "diff_grade": r.get("diff_grade"),
            "vertical_gain_m": r.get("vertical_gain_m"),
            "max_altitude_m": r.get("max_altitude_m"),
            "verified_at": r.get("verified_at"),
            "has_track": bool(r.get("track_points")),
        })
    return {
        "slug": cur["slug"], "name": cur["name"], "ruolo": cur.get("ruolo"),
        "bio": cur.get("bio"), "links": cur.get("links") or {},
        "curatore_verificato": bool(cur.get("curatore_verificato")),
        "collezione": {
            "titolo": coll.get("titolo"),
            "descrizione": coll.get("descrizione"),
            "routes": routes,
        },
    }
