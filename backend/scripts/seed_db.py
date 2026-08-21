"""
Apply schema and/or load route-db/seed_routes.json into Postgres. Idempotent
(upserts by slug) — safe to re-run after editing the seed.

Usage:
    export DATABASE_URL=postgresql://user:pass@host:5432/aimeteo
    python scripts/seed_db.py --schema          # apply route-db/schema.sql first (fresh DB)
    python scripts/seed_db.py                   # (re)load seed only

Load order follows route-db/schema.md: area, refuge → route → route_refuge.
GPX tracks / route_sample / coordinates are ingested separately — never fabricated here.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

import psycopg

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMA_SQL = REPO_ROOT / "route-db" / "schema.sql"
SEED_JSON = REPO_ROOT / "route-db" / "seed_routes.json"

UPSERT_AREA = """
INSERT INTO area (slug, name, country, region, default_locale,
                  avalanche_service, avalanche_zone, avalanche_subzone)
VALUES (%(id)s, %(name)s, %(country)s, %(region)s, %(default_locale)s,
        %(avalanche_service)s, %(avalanche_zone)s, %(avalanche_subzone)s)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, country = EXCLUDED.country, region = EXCLUDED.region,
  default_locale = EXCLUDED.default_locale,
  avalanche_service = EXCLUDED.avalanche_service,
  avalanche_zone = EXCLUDED.avalanche_zone,
  avalanche_subzone = EXCLUDED.avalanche_subzone
"""

UPSERT_REFUGE = """
INSERT INTO refuge (slug, name, type, altitude_m)
VALUES (%(id)s, %(name)s, %(type)s, %(altitude_m)s)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, altitude_m = EXCLUDED.altitude_m
"""

UPSERT_ROUTE = """
INSERT INTO route (slug, name, area_id, activity, diff_scale, diff_grade, diff_index,
                   start_altitude_m, max_altitude_m, vertical_gain_m,
                   avg_ascent_min, avg_descent_min, primary_aspects, max_slope_deg,
                   ideal_conditions, exposure_notes, source, verified_at)
VALUES (%(slug)s, %(name)s,
        (SELECT id FROM area WHERE slug = %(area_id)s),
        %(activity)s::activity_type, %(diff_scale)s::difficulty_scale,
        %(diff_grade)s, %(diff_index)s,
        %(start_altitude_m)s, %(max_altitude_m)s, %(vertical_gain_m)s,
        %(avg_ascent_min)s, %(avg_descent_min)s,
        %(primary_aspects)s::aspect_dir[], %(max_slope_deg)s,
        %(ideal_conditions)s, %(exposure_notes)s, %(source)s, %(verified_at)s)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, area_id = EXCLUDED.area_id, activity = EXCLUDED.activity,
  diff_scale = EXCLUDED.diff_scale, diff_grade = EXCLUDED.diff_grade,
  diff_index = EXCLUDED.diff_index,
  start_altitude_m = EXCLUDED.start_altitude_m, max_altitude_m = EXCLUDED.max_altitude_m,
  vertical_gain_m = EXCLUDED.vertical_gain_m,
  avg_ascent_min = EXCLUDED.avg_ascent_min, avg_descent_min = EXCLUDED.avg_descent_min,
  primary_aspects = EXCLUDED.primary_aspects, max_slope_deg = EXCLUDED.max_slope_deg,
  ideal_conditions = EXCLUDED.ideal_conditions, exposure_notes = EXCLUDED.exposure_notes,
  source = EXCLUDED.source, verified_at = EXCLUDED.verified_at,
  updated_at = now()
"""

ROUTE_DEFAULTS = {
    "vertical_gain_m": None, "avg_ascent_min": None, "avg_descent_min": None,
    "max_slope_deg": None, "ideal_conditions": None, "exposure_notes": None,
    "source": None, "verified_at": None,
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--schema", action="store_true", help="apply route-db/schema.sql first")
    ap.add_argument("--dsn", default=os.getenv("DATABASE_URL", ""), help="Postgres DSN")
    ap.add_argument("--seed", default=str(SEED_JSON), help="path to seed JSON")
    args = ap.parse_args()

    if not args.dsn:
        print("error: set DATABASE_URL or pass --dsn", file=sys.stderr)
        return 2

    with open(args.seed, encoding="utf-8") as f:
        seed = json.load(f)

    with psycopg.connect(args.dsn) as conn:
        with conn.cursor() as cur:
            if args.schema:
                cur.execute(SCHEMA_SQL.read_text(encoding="utf-8"))
                print(f"applied {SCHEMA_SQL.name}")

            for area in seed["areas"]:
                cur.execute(UPSERT_AREA, area)
            print(f"upserted {len(seed['areas'])} areas")

            for refuge in seed.get("refuges", []):
                cur.execute(UPSERT_REFUGE, {"type": "rifugio", **refuge})
            print(f"upserted {len(seed.get('refuges', []))} refuges")

            for route in seed["routes"]:
                cur.execute(UPSERT_ROUTE, {**ROUTE_DEFAULTS, **route})
                # refresh refuge links
                cur.execute(
                    "DELETE FROM route_refuge WHERE route_id = "
                    "(SELECT id FROM route WHERE slug = %s)", (route["slug"],),
                )
                for link in route.get("refuges", []):
                    cur.execute(
                        """INSERT INTO route_refuge (route_id, refuge_id, role)
                           VALUES ((SELECT id FROM route WHERE slug = %(route)s),
                                   (SELECT id FROM refuge WHERE slug = %(refuge)s),
                                   %(role)s)""",
                        {"route": route["slug"], "refuge": link["id"], "role": link.get("role")},
                    )
            print(f"upserted {len(seed['routes'])} routes")
        conn.commit()
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
