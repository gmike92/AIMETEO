"""
Postgres route store — queries against route-db/schema.sql (Cloud SQL ready).

Contract: returns the exact same dict shapes as store_memory (the seed JSON),
so services and the frontend are unchanged. External ids are the stable slugs
(area.slug, refuge.slug, route.slug); UUID primary keys stay internal.
"""
from __future__ import annotations

from . import db

_AREA_COLS = """
    a.slug AS id, a.name, a.country, a.region, a.default_locale,
    a.avalanche_service, a.avalanche_zone, a.avalanche_subzone
"""

_ROUTE_COLS_BASE = """
    r.slug, r.name, a.slug AS area_id, r.activity::text AS activity,
    r.diff_scale::text AS diff_scale, r.diff_grade, r.diff_index,
    r.start_altitude_m, r.max_altitude_m, r.vertical_gain_m,
    r.avg_ascent_min, r.avg_descent_min,
    r.primary_aspects::text[] AS primary_aspects, r.max_slope_deg,
    r.ideal_conditions, r.exposure_notes, r.source, r.verified_at,
    COALESCE((
        SELECT json_agg(json_build_object('id', rf.slug, 'role', rr.role) ORDER BY rf.slug)
        FROM route_refuge rr JOIN refuge rf ON rf.id = rr.refuge_id
        WHERE rr.route_id = r.id
    ), '[]'::json) AS refuges
"""

#: With PostGIS: expose real start coordinates (from GPX ingestion) so the
#: planner can request live per-route forecasts. NULL until a GPX is ingested.
_ROUTE_COLS_GIS = _ROUTE_COLS_BASE + """,
    ST_Y(r.start_point::geometry) AS start_lat,
    ST_X(r.start_point::geometry) AS start_lon
"""

_has_postgis: bool | None = None


def _route_cols() -> str:
    """PostGIS-aware column list (bare-Postgres CI sandboxes shim GEOGRAPHY→TEXT)."""
    global _has_postgis
    if _has_postgis is None:
        try:
            with db.cursor() as cur:
                cur.execute("SELECT postgis_version()")
            _has_postgis = True
        except Exception:
            _has_postgis = False
    return _ROUTE_COLS_GIS if _has_postgis else _ROUTE_COLS_BASE


def list_areas() -> list[dict]:
    with db.cursor() as cur:
        cur.execute(f"SELECT {_AREA_COLS} FROM area a ORDER BY a.name")
        return cur.fetchall()


def list_routes() -> list[dict]:
    with db.cursor() as cur:
        cur.execute(
            f"SELECT {_route_cols()} FROM route r LEFT JOIN area a ON a.id = r.area_id "
            "ORDER BY r.name"
        )
        return cur.fetchall()


def get_route(slug: str) -> dict | None:
    with db.cursor() as cur:
        cur.execute(
            f"SELECT {_route_cols()} FROM route r LEFT JOIN area a ON a.id = r.area_id "
            "WHERE r.slug = %s",
            (slug,),
        )
        route = cur.fetchone()
        if route is None or not _has_postgis:
            return route
        # Track points from GPX ingestion (route_sample) — used by the terrain
        # service for DEM sampling. Empty list until a GPX is ingested.
        cur.execute(
            """SELECT ST_Y(point::geometry) AS lat, ST_X(point::geometry) AS lon,
                      altitude_m AS ele
               FROM route_sample rs JOIN route r ON r.id = rs.route_id
               WHERE r.slug = %s ORDER BY rs.seq""",
            (slug,),
        )
        route["track_points"] = cur.fetchall()
        return route


def area_for_route(route: dict) -> dict | None:
    area_slug = route.get("area_id")
    if not area_slug:
        return None
    with db.cursor() as cur:
        cur.execute(f"SELECT {_AREA_COLS} FROM area a WHERE a.slug = %s", (area_slug,))
        return cur.fetchone()
