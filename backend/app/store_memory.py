"""
In-memory route store (offline dev fallback).

Loads route-db/seed_routes.json so the API returns real-shaped data with no DB.
Selected by store.py when DATABASE_URL is empty.
"""
from __future__ import annotations
import json
import pathlib
from functools import lru_cache

# repo root = .../AIWEATHER ; seed lives at route-db/seed_routes.json
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_SEED = _REPO_ROOT / "route-db" / "seed_routes.json"


@lru_cache(maxsize=1)
def _data() -> dict:
    with open(_SEED, encoding="utf-8") as f:
        data = json.load(f)
    _hydrate_refuges(data)
    return data


def _hydrate_refuges(data: dict) -> None:
    """Aggiunge il NOME del rifugio a ogni legame itinerario→rifugio.

    Nel seed il legame è normalizzato ({id, role}) e il nome vive una volta
    sola nel record del rifugio — giusto per i dati, scomodo per chi legge:
    prompts.py mostrerebbe "ref-cabane-estany-de-la-bova" al posto di
    "Cabane Estany de la Bova" nel contesto della relazione AI.

    Lo stesso campo lo produce store_pg con una join (vedi _ROUTE_COLS_BASE):
    i due backend devono restituire dict identici, è il contratto dichiarato
    in store.py. Un legame che punta a un rifugio inesistente resta senza
    nome invece di far saltare tutto — chi legge ricade sull'id.
    """
    by_id = {r["id"]: r for r in data.get("refuges", [])}
    for route in data.get("routes", []):
        for link in route.get("refuges") or []:
            refuge = by_id.get(link.get("id"))
            if refuge is not None:
                link["name"] = refuge["name"]


def list_areas() -> list[dict]:
    return _data()["areas"]


def list_routes() -> list[dict]:
    return _data()["routes"]


def get_route(slug: str) -> dict | None:
    return next((r for r in list_routes() if r["slug"] == slug), None)


def area_for_route(route: dict) -> dict | None:
    return next((a for a in list_areas() if a["id"] == route.get("area_id")), None)
