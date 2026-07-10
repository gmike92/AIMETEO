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
        return json.load(f)


def list_areas() -> list[dict]:
    return _data()["areas"]


def list_routes() -> list[dict]:
    return _data()["routes"]


def get_route(slug: str) -> dict | None:
    return next((r for r in list_routes() if r["slug"] == slug), None)


def area_for_route(route: dict) -> dict | None:
    return next((a for a in list_areas() if a["id"] == route.get("area_id")), None)
