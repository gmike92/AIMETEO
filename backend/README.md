# AIMETEO backend

Cloud Run-ready FastAPI app. Four **vertical-agnostic** services plus the trip planner,
made **country-agnostic** by pluggable avalanche-bulletin connectors.

> Design law: **AI for language, structured data for facts.** The deterministic safety
> filters run before any route reaches Gemini, and we never author danger ratings.

## Layout
```
backend/
├── app/
│   ├── main.py            # FastAPI entrypoint, routers, /healthz
│   ├── config.py          # env-driven settings + feature flags
│   ├── models.py          # Pydantic contracts
│   ├── store.py           # route-store facade: Postgres if DATABASE_URL set, else in-memory
│   ├── store_pg.py        # Postgres store (route-db/schema.sql, Cloud SQL-ready)
│   ├── store_memory.py    # in-memory store (reads route-db/seed_routes.json)
│   ├── db.py              # psycopg connection pool
│   ├── llm.py             # Vertex AI / Gemini client (REST + ADC, enforced JSON, fail-safe)
│   ├── prompts.py         # ONLY place model-facing text is built (grounded payloads + schemas)
│   ├── gpx.py             # GPX parser + ~50 m decimation (selects real points, never interpolates)
│   ├── safety_filters.py  # canonical hard safety filters (fail-closed)
│   ├── connectors/        # pluggable avalanche sources
│   │   ├── base.py        #   AvalancheConnector interface (normalizes to EAWS 1–5)
│   │   ├── caaml.py       #   CAAML v6 (EAWS) JSON parser — pure, tested
│   │   ├── aineva.py      #   AINEVA (IT) — REAL feed (avalanche.report mirror) + mock fallback
│   │   ├── registry.py    #   resolve connector by service/country
│   │   └── fixtures/      #   real CAAML responses for offline tests
│   ├── providers/         # external data providers (fetch + normalize only)
│   │   ├── google_weather.py  # Maps Weather API + TTL/DB cache, derived freezing level (disclosed)
│   │   └── earth_engine.py    # DEM slope/aspect sampling (optional earthengine-api)
│   └── services/
│       ├── forecast.py    # GET  /forecast/point (live Maps Weather or mock)
│       ├── terrain.py     # GET  /terrain/{slug} (DEM when GPX ingested, else metadata)
│       ├── briefing.py    # POST /briefing (Gemini relazione, deterministic fallback)
│       ├── alert.py       # POST /alert/subscribe · /alert/run (Scheduler diff job)
│       ├── planner.py     # POST /planner/plan (safety filters → Gemini trip card)
│       └── waitlist.py    # POST /waitlist
├── scripts/
│   ├── seed_db.py         # apply schema.sql + upsert seed_routes.json (idempotent)
│   └── ingest_gpx.py      # ingest a curator GPX per route (sanity-gated; DB + seed JSON)
├── Dockerfile
├── requirements.txt
└── .env.example
```

## Run locally
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env            # defaults to mock data, no external calls
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

### With Postgres (real route store)
Leave `DATABASE_URL` empty to use the offline in-memory seed store. To run against
Postgres (local Docker or Cloud SQL):
```bash
docker run -d --name aimeteo-pg -e POSTGRES_USER=aimeteo -e POSTGRES_PASSWORD=aimeteo \
  -e POSTGRES_DB=aimeteo -p 5432:5432 postgis/postgis:16-3.4

export DATABASE_URL=postgresql://aimeteo:aimeteo@localhost:5432/aimeteo
python scripts/seed_db.py --schema   # apply route-db/schema.sql + load seed (idempotent)
uvicorn app.main:app --reload        # /healthz now reports route_store: postgres
```
Integration test (schema + seed + store + API contract; also runs on Postgres
without PostGIS — geometry columns are shimmed):
```bash
DATABASE_URL=postgresql://...  python tests/test_store_pg.py
```

Quick check:
```bash
curl localhost:8000/healthz
curl "localhost:8000/forecast/point?lat=46.4&lon=12.0"
curl -X POST localhost:8000/planner/plan \
  -H 'content-type: application/json' \
  -d '{"intent_text":"gita scialpinistica in Dolomiti","activity":"scialpinismo"}'
```

## Deploy to Cloud Run
```bash
gcloud run deploy aimeteo-backend \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars USE_MOCK_DATA=false,DEFAULT_COUNTRY=IT \
  --set-secrets MAPS_WEATHER_API_KEY=maps-weather-key:latest
```

## Data status
- ✅ **AINEVA avalanche bulletins — REAL.** `connectors/aineva.py` fetches official EAWS
  CAAML v6 JSON from the avalanche.report static mirror and `connectors/caaml.py` normalizes
  it to EAWS 1–5 (parser tested against real fixtures in `tests/test_caaml.py`). Set
  `USE_MOCK_DATA=false` to hit the live feed; `true` returns a deterministic mock for offline
  dev / off-season.

- ✅ **Route store — REAL Postgres path.** `store_pg.py` + `scripts/seed_db.py` run against
  `route-db/schema.sql` (Cloud SQL-ready); `store.py` falls back to the in-memory seed store
  when `DATABASE_URL` is empty. Contract-tested in `tests/test_store_pg.py`.

- ✅ **Forecast, Gemini, terrain, alerts — code-complete** (2026-07-01, all fail-safe with
  offline fallbacks; see `PROJECT_STATUS.md`). Going live is configuration:
  `GCP_PROJECT` + ADC (Gemini), `MAPS_WEATHER_API_KEY` (forecast), `earthengine-api`
  package (terrain), a Cloud Scheduler job → `POST /alert/run` (alerts).

- ⏳ **Route coordinates — the missing DATA.** Live per-route forecasts and DEM sampling
  activate per route once a real GPX is ingested:
  `python scripts/ingest_gpx.py track.gpx --route <slug>` (wrong-file sanity gate included).

Next expansion: other Italian regions/Meteomont + international connectors (LWD/SLF/ANENA/ARSO).

## Adding a country
Implement `AvalancheConnector` (e.g. `connectors/slf.py` for Switzerland), normalize to
EAWS 1–5, then `register(SlfConnector())` in `registry.py`. Nothing else changes — the
safety engine, planner, and models are already cross-border.
