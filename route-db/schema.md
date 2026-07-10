# Route DB — schema v1 notes

The route database is the moat. The schema is built so the **safety engine can compute on facts**, and the AI only ever *reads* and *narrates* — it never writes route facts or danger ratings.

## Design rules
1. **Facts only, machine-checkable.** Every field the safety filter needs (aspect, max slope, altitude, season) is a typed column, not buried in prose.
2. **Official danger is never ours.** Avalanche danger lives in `avalanche_bulletin` verbatim from AINEVA/Meteomont/ARPA, with `source_url`. We aggregate and attribute; we never author a danger level.
3. **Provenance + freshness on every route.** `source`, `verified_by`, `verified_at`, plus `route_report` for community condition updates. Unverified rows (`verified_at IS NULL`) must be flagged in UI and excluded from Pro trip-planner candidates until a curator signs off.
4. **Vertical-agnostic AND country-agnostic core.** `activity_type` lets the same tables serve scialpinismo today and cycling later. `area.country` / `default_locale` and a generic `avalanche_service` + `avalanche_zone` (not hard-coded to AINEVA) let the same tables serve Italy today and AT/CH/FR/SI later — both are "new rows, not new schema." EAWS 1–5 danger is pan-European, so the safety engine works cross-border; only the bulletin connector changes per country.
5. **Geometry for real terrain.** `track` (GPX) + `route_sample` (per-~50 m slope/aspect/altitude from Earth Engine DEM) feed aspect-specific wind-loading and slope checks.

## Table map
- `area` — massifs, linked to ARPA + AINEVA zones (the join key to live bulletins).
- `refuge` — huts/bivouacs with opening windows; routes depend on them via `route_refuge`.
- `route` — the core record (difficulty, altitudes, aspects, max slope, season, descent options, exposure notes, provenance).
- `route_sample` — DEM-derived terrain samples along the track.
- `route_photo`, `route_report` — media and community freshness.
- `avalanche_bulletin`, `forecast_cache` — live caches written by ETL, read by the safety engine.
- `plan_audit` — the liability "scatola nera": prompt + raw weather + bulletin in force + final response, immutable.

## Difficulty normalization
Grades use different scales (UIAA, BSA, EE/EEA, ferrata). Store the **raw community grade** in `diff_grade` (so Italians see what they expect) plus a normalized `diff_index` (0–100) so the planner can rank across scales and match a user's stated level.

## Seeding
`seed_routes.json` holds a 5-route sample across activities/areas for development. **All seed rows are unverified** (`verified_at: null`) — they exist to exercise the schema and pipeline, not for production recommendations. Real ingestion: GPX from CAI guides / Gulliver / Skitourenguru / OSM → terrain samples from Earth Engine → curator verification.

## Load order
1. `schema.sql`
2. `area`, `refuge`
3. `route` (+ `route_refuge`)
4. `route_sample` (from GPX/DEM)
5. live caches via ETL.

## Changelog
- **2026-06-08** — schema v1 + 5-route seed. Covers difficulty normalization, aspect arrays, terrain samples, official-bulletin separation, and the audit log.
- **2026-06-08** — schema v1.1: made country-agnostic for international expansion. `area` gains `country`, `default_locale`, generic `avalanche_service`/`avalanche_zone` (replacing `aineva_zone`/`arpa_zone`); `avalanche_bulletin` keyed by service+zone+country with `raw_locale`. Seed updated.
- **2026-06-09** — schema v1.2, first real DB wiring: `area.slug` and `refuge.slug` added as stable natural keys (the API exposes slugs; UUID PKs stay internal); `route.start_point` temporarily nullable until GPX ingestion lands (seed carries no coordinates — never fabricate; restore NOT NULL in v2). Loader: `backend/scripts/seed_db.py` (idempotent upserts by slug). Store: `backend/app/store_pg.py` behind the `store.py` facade (`DATABASE_URL` toggle).
- **2026-07-01** — schema v1.3: `waitlist` table (pre-launch email capture; unique lowercase email, `source`/`locale` for attribution). Used by `backend/app/services/waitlist.py`; landing + frontend post to `POST /waitlist`.
