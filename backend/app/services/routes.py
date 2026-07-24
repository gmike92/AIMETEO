"""
Routes service — browse the route database.
Production: Cloud SQL queries. Skeleton: reads the in-memory store.
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from .. import store
from ..model import timing

router = APIRouter(prefix="/routes", tags=["routes"])


def _tempi(r: dict) -> dict | None:
    """Tempi metodo svizzero: dalla traccia reale, o parziali dal dislivello."""
    return (timing.estimate(r.get("track_points"), r.get("activity"))
            or timing.estimate_from_gain(r.get("vertical_gain_m"), r.get("activity")))


@router.get("")
def list_routes(activity: str | None = None, area_id: str | None = None) -> list[dict]:
    routes = store.list_routes()
    if activity:
        routes = [r for r in routes if r["activity"] == activity]
    if area_id:
        routes = [r for r in routes if r.get("area_id") == area_id]
    # Attach a light area summary for display.
    out = []
    for r in routes:
        area = store.area_for_route(r) or {}
        out.append({**r, "area_name": area.get("name"), "country": area.get("country"),
                    "tempi": _tempi(r)})
    return out


@router.get("/areas")
def list_areas() -> list[dict]:
    return store.list_areas()


@router.get("/{slug}")
def get_route(slug: str) -> dict:
    r = store.get_route(slug)
    if not r:
        raise HTTPException(404, f"route '{slug}' not found")
    area = store.area_for_route(r) or {}
    return {**r, "area": area, "tempi": _tempi(r)}
