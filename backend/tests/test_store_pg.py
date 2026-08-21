"""
Integration test: Postgres route store + API contract.

Needs a reachable Postgres at DATABASE_URL (any empty database).
    export DATABASE_URL=postgresql://user:pass@host:5432/aimeteo_test
    cd backend && python tests/test_store_pg.py

Works on real Postgres+PostGIS *and* on bare Postgres without PostGIS (e.g. the
PGlite sandbox used in CI): if `CREATE EXTENSION postgis` fails, GEOGRAPHY columns
become TEXT and GIST indexes are skipped — the store/API contract never touches
geometry, so the test stays meaningful.

Verifies: schema applies; seed loads idempotently (run twice); store_pg returns
the exact same shapes as the in-memory seed store; /routes, /routes/areas,
/routes/{slug}, /briefing and /planner/plan behave identically over Postgres.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / "backend"
SCHEMA_SQL = REPO_ROOT / "route-db" / "schema.sql"
SEED_JSON = REPO_ROOT / "route-db" / "seed_routes.json"

DSN = os.environ.get("DATABASE_URL", "")
if not DSN:
    print("SKIP: DATABASE_URL not set")
    sys.exit(0)

# Make the app importable and force the PG store + offline connectors.
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("USE_MOCK_DATA", "true")
os.environ.setdefault("DB_POOL_MAX", "1")  # PGlite handles one connection at a time

import psycopg  # noqa: E402

PASS = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS
    status = "PASS" if cond else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if cond:
        PASS += 1
    else:
        sys.exit(1)


def degeo(schema: str) -> str:
    """Fallback for Postgres without PostGIS: GEOGRAPHY → TEXT, drop GIST indexes."""
    schema = schema.replace('CREATE EXTENSION IF NOT EXISTS postgis;', '')
    schema = re.sub(r"GEOGRAPHY\([A-Z]+,\s*\d+\)", "TEXT", schema)
    schema = re.sub(r"CREATE INDEX\s+\S+\s+ON\s+\S+\s+USING\s+GIST\([^)]*\);", "", schema)
    return schema


print("== schema ==")
with psycopg.connect(DSN, autocommit=True) as conn:
    has_postgis = True
    try:
        conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    except psycopg.Error:
        has_postgis = False
    print(f"  postgis available: {has_postgis}")
    schema = SCHEMA_SQL.read_text(encoding="utf-8")
    conn.execute(schema if has_postgis else degeo(schema))
    check("schema.sql applied", True)

print("== seed (twice — idempotency) ==")
env = {**os.environ, "DATABASE_URL": DSN}
for i in (1, 2):
    r = subprocess.run(
        [sys.executable, str(BACKEND / "scripts" / "seed_db.py")],
        env=env, capture_output=True, text=True,
    )
    check(f"seed run {i}", r.returncode == 0, r.stderr.strip()[-400:])

print("== store contract: postgres vs seed JSON ==")
os.environ["DATABASE_URL"] = DSN
from app import store  # noqa: E402

check("facade picked postgres backend", store.BACKEND == "postgres")
seed = json.loads(SEED_JSON.read_text(encoding="utf-8"))

areas = store.list_areas()
check("area count", len(areas) == len(seed["areas"]), f"{len(areas)}")
seed_areas = {a["id"]: a for a in seed["areas"]}
for a in areas:
    exp = seed_areas[a["id"]]
    check(f"area {a['id']} fields", all(a[k] == exp[k] for k in exp), str(a))

routes = store.list_routes()
check("route count", len(routes) == len(seed["routes"]), f"{len(routes)}")
seed_routes = {r["slug"]: r for r in seed["routes"]}
for r in routes:
    exp = seed_routes[r["slug"]]
    same = all(r[k] == exp[k] for k in exp)
    check(f"route {r['slug']} fields", same,
          str({k: (r[k], exp[k]) for k in exp if r[k] != exp[k]}))

r1 = store.get_route("scialpinismo-monte-vioz-da-pejo")
check("get_route", r1 is not None and r1["refuges"] == [{"id": "ref-vioz", "role": "appoggio"}])
check("get_route missing → None", store.get_route("nope") is None)
a1 = store.area_for_route(r1)
check("area_for_route", a1 is not None and a1["avalanche_zone"] == "IT-32-BZ")

print("== API over postgres ==")
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
resp = client.get("/routes")
check("GET /routes 200", resp.status_code == 200)
body = resp.json()
check("GET /routes enriched", all("area_name" in r and "country" in r for r in body))
check("GET /routes/areas", client.get("/routes/areas").status_code == 200)
resp = client.get("/routes/scialpinismo-monte-vioz-da-pejo")
check("GET /routes/{slug} embeds area",
      resp.status_code == 200 and resp.json()["area"]["name"] == "Ortles-Cevedale")
check("GET /routes/{slug} 404", client.get("/routes/nope").status_code == 404)
resp = client.get("/routes", params={"activity": "scialpinismo"})
check("GET /routes?activity filter",
      resp.status_code == 200 and {r["activity"] for r in resp.json()} == {"scialpinismo"})

resp = client.post("/briefing", json={"route_id": "scialpinismo-monte-vioz-da-pejo",
                                      "locale": "it"})
check("POST /briefing (mock bulletin)", resp.status_code in (200, 409), str(resp.status_code))

resp = client.post("/planner/plan", json={"activity": "scialpinismo", "date": "2026-02-15",
                                          "intent_text": "scialpinismo domani in Lombardia"})
check("POST /planner/plan 200", resp.status_code == 200, resp.text[:300])
plan = resp.json()
check("planner evaluated all routes",
      len(plan["safe_candidates"]) + len(plan["blocked"]) == 2, str(plan)[:300])

print(f"\nALL OK — {PASS} checks passed (backend=postgres, postgis={has_postgis})")
