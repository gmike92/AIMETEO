-- AIMETEO Route Database — schema v1.3
-- PostgreSQL 15+ with PostGIS. This is the moat: structured Italian mountain routes.
-- Design principle: store FACTS the safety engine can compute on. AI never writes here.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- Enumerations
-- ─────────────────────────────────────────────────────────────

-- Activity verticals (backend is vertical-agnostic; product is mountain-shaped first)
CREATE TYPE activity_type AS ENUM (
  'scialpinismo',      -- ski mountaineering
  'alpinismo',         -- alpinism / mountaineering
  'arrampicata',       -- rock climbing / falesia
  'via_ferrata',
  'escursionismo',     -- hiking / trekking
  'trail_running',
  'mtb_alpino',
  'volo_libero'        -- paragliding (phase 2)
);

-- Aspect / exposure (polar mapping for solar irradiation + wind loading cross-reference)
CREATE TYPE aspect_dir AS ENUM ('N','NE','E','SE','S','SW','W','NW');

-- Difficulty is scale-dependent; store the scale + grade as text, keep a normalized 0–100 index for ranking.
CREATE TYPE difficulty_scale AS ENUM (
  'UIAA',   -- climbing (I–VII+)
  'BSA',    -- ski mountaineering (MS, BS, OS, BSA, OSA)
  'EE_EEA', -- hiking (T, E, EE, EEA)
  'FERRATA',-- ferrata grade (F, PD, D, TD, ED)
  'CAI',    -- generic CAI difficulty (Italian hiking network)
  'C2C',    -- grade taken verbatim from Camptocamp.org (scripts/import_c2c.py),
            -- kept as-is rather than remapped into another scale — mixed
            -- units across activities (ski_rating/hiking_rating/...), see
            -- RATING_FIELDS in that script.
  'OSM'     -- grade taken verbatim from an OpenStreetMap difficulty tag with
            -- no dedicated scale here (mtb:scale, sac_scale, ...), or "n.d."
            -- when the tag is absent — never inferred (scripts/import_osm_mtb.py,
            -- import_osm_hiking.py).
);

-- ─────────────────────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────────────────────

-- Massifs / areas, for SEO long-tail and filtering ("Massiccio del Sella")
-- Country-agnostic: launch is Italy-only, but expansion = new rows, not schema changes.
CREATE TABLE area (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              TEXT UNIQUE NOT NULL,  -- stable natural key exposed by the API, e.g. "area-ortles-cevedale"
  name              TEXT NOT NULL,         -- e.g. "Dolomiti di Sesto"
  country           CHAR(2) NOT NULL DEFAULT 'IT',  -- ISO-3166: IT, AT, CH, FR, SI...
  region            TEXT NOT NULL,         -- e.g. "Trentino-Alto Adige" / "Tirol" / "Valais"
  default_locale    TEXT NOT NULL DEFAULT 'it',     -- BCP-47: it, de, fr, sl, en
  -- Generic avalanche reference (not hard-coded to AINEVA): which service + which zone.
  avalanche_service TEXT,                  -- 'AINEVA' | 'Meteomont' | 'LWD' | 'SLF' | 'ANENA' | 'ARSO'
  avalanche_zone    TEXT,                  -- macro region / bulletin file id (EAWS), e.g. 'IT-25', 'IT-32-TN'
  avalanche_subzone TEXT,                  -- micro-region id (EAWS regionID), e.g. 'IT-25-BG-02' (nullable)
  weather_region    TEXT,                  -- regional forecast bulletin zone (e.g. ARPA), nullable
  centroid          GEOGRAPHY(POINT,4326),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_area_country  ON area(country);
CREATE INDEX idx_area_avalanche ON area(avalanche_service, avalanche_zone);

-- Refuges / bivouacs that routes depend on (availability, seasonal opening)
CREATE TABLE refuge (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT UNIQUE NOT NULL,             -- stable natural key, e.g. "ref-vioz"
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'rifugio',  -- rifugio | bivacco | capanna
  altitude_m   INTEGER,
  location     GEOGRAPHY(POINT,4326),
  phone        TEXT,
  booking_url  TEXT,
  season_open  DATERANGE,                   -- typical opening window
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The route: the heart of the moat
CREATE TABLE route (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug             TEXT UNIQUE NOT NULL,       -- SEO: "scialpinismo-monte-vioz-pejo"
  name             TEXT NOT NULL,              -- real local name, e.g. "Monte Vioz da Pejo"
  area_id          UUID REFERENCES area(id),
  activity         activity_type NOT NULL,

  -- Difficulty (scale + raw grade + normalized index for cross-scale ranking)
  diff_scale       difficulty_scale NOT NULL,
  diff_grade       TEXT NOT NULL,             -- raw grade as the community uses it, e.g. "BSA", "PD", "EE"
  diff_index       SMALLINT CHECK (diff_index BETWEEN 0 AND 100),

  -- Altitudes & timing
  start_altitude_m INTEGER NOT NULL,          -- quota di attacco
  max_altitude_m   INTEGER NOT NULL,          -- quota massima
  vertical_gain_m  INTEGER,                    -- dislivello
  avg_ascent_min   INTEGER,                    -- tempo medio salita
  avg_descent_min  INTEGER,

  -- Terrain / exposure (cross-referenced by safety engine)
  primary_aspects  aspect_dir[] NOT NULL,      -- {N,NE} polar exposure of crux slopes
  max_slope_deg    SMALLINT,                   -- steepest sustained slope (avalanche-relevant)
  crux_description TEXT,

  -- Geometry (GPX track; slope sampled ~every 50 m stored in route_sample)
  track            GEOGRAPHY(LINESTRINGZ,4326),
  -- Nullable until GPX ingestion lands (seed routes carry no coordinates: never fabricate).
  -- TODO(schema v2): restore NOT NULL once every route has a verified GPX/trailhead point.
  start_point      GEOGRAPHY(POINT,4326),
  summit_point     GEOGRAPHY(POINT,4326),

  -- Conditions & seasonality
  ideal_season     DATERANGE,                  -- finestra stagionale ideale
  ideal_conditions TEXT,                       -- free text: "neve trasformata, dopo gelo notturno"
  descent_options  JSONB,                      -- [{name, notes, gpx_ref}]

  -- Liability-relevant context
  exposure_notes   TEXT,                       -- objective hazards (seracchi, scariche, cornici)

  -- Provenance & freshness
  source           TEXT,                       -- CAI guide, Gulliver, Skitourenguru, OSM...
  source_url       TEXT,
  verified_by      TEXT,                       -- internal curator / guide who validated
  verified_at      DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_route_area     ON route(area_id);
CREATE INDEX idx_route_activity ON route(activity);
CREATE INDEX idx_route_aspects  ON route USING GIN(primary_aspects);
CREATE INDEX idx_route_track    ON route USING GIST(track);
CREATE INDEX idx_route_start    ON route USING GIST(start_point);

-- Per-50 m terrain samples (slope/aspect/altitude along the track) — from DEM (Earth Engine)
CREATE TABLE route_sample (
  route_id     UUID REFERENCES route(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,           -- order along track
  point        GEOGRAPHY(POINTZ,4326) NOT NULL,
  altitude_m   INTEGER,
  slope_deg    SMALLINT,
  aspect       aspect_dir,
  PRIMARY KEY (route_id, seq)
);

-- Many-to-many: routes depend on refuges
CREATE TABLE route_refuge (
  route_id   UUID REFERENCES route(id) ON DELETE CASCADE,
  refuge_id  UUID REFERENCES refuge(id) ON DELETE CASCADE,
  role       TEXT,                          -- 'base' | 'appoggio' | 'discesa'
  PRIMARY KEY (route_id, refuge_id)
);

-- Photos (object-store URLs; never store binaries in DB)
CREATE TABLE route_photo (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id   UUID REFERENCES route(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  caption    TEXT,
  credit     TEXT,
  taken_on   DATE
);

-- Community recent reports (condition updates; feed freshness + planner context)
CREATE TABLE route_report (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id     UUID REFERENCES route(id) ON DELETE CASCADE,
  reported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  conditions   TEXT NOT NULL,
  snow_quality TEXT,
  author       TEXT,
  source       TEXT                           -- 'app' | 'gulliver' | 'cai_section'
);
CREATE INDEX idx_report_route_time ON route_report(route_id, reported_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Live data caches (written by ETL, read by safety engine; AI reads, never writes)
-- ─────────────────────────────────────────────────────────────

-- Latest official avalanche bulletin per service+zone (we NEVER author danger ratings).
-- EAWS 1–5 danger scale is pan-European, so this table is cross-border by design.
CREATE TABLE avalanche_bulletin (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  avalanche_service TEXT NOT NULL,             -- 'AINEVA' | 'Meteomont' | 'LWD' | 'SLF' | 'ANENA' | 'ARSO'
  avalanche_zone TEXT NOT NULL,                -- service-specific zone id (joins area.avalanche_zone)
  country       CHAR(2) NOT NULL DEFAULT 'IT',
  issued_at     TIMESTAMPTZ NOT NULL,
  valid_until   TIMESTAMPTZ,
  danger_level  SMALLINT NOT NULL CHECK (danger_level BETWEEN 1 AND 5),  -- official EAWS scale
  danger_by_aspect JSONB,                     -- {"N":4,"NE":4,"E":3,...} per-aspect/altitude
  problem_types TEXT[],                        -- EAWS problem types, e.g. {'wind_slab','wet_snow'}
  raw_text      TEXT NOT NULL,                 -- verbatim official text (original language)
  raw_locale    TEXT,                          -- language of raw_text (it, de, fr, sl)
  source_url    TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bulletin_zone_time ON avalanche_bulletin(avalanche_service, avalanche_zone, issued_at DESC);

-- Cached point forecasts (Maps Weather API / ARPA), keyed by rounded lat/lon
CREATE TABLE forecast_cache (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  geohash      TEXT NOT NULL,                  -- spatial cache key
  valid_at     TIMESTAMPTZ NOT NULL,
  payload      JSONB NOT NULL,                 -- normalized forecast (temp, wind, freezing_level, precip...)
  source       TEXT NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (geohash, valid_at, source)
);
CREATE INDEX idx_forecast_geohash ON forecast_cache(geohash, valid_at);

-- ─────────────────────────────────────────────────────────────
-- Audit log (liability "scatola nera" — immutable, 10y retention via Cloud Logging too)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE plan_audit (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id         UUID,
  prompt_sent     TEXT NOT NULL,               -- exact prompt to Gemini
  weather_snapshot JSONB NOT NULL,             -- raw weather data used
  bulletin_snapshot JSONB NOT NULL,            -- official bulletin in force
  candidate_routes UUID[],                     -- routes that passed safety filters
  final_response  TEXT NOT NULL                -- generated plan shown to user
);

-- ─────────────────────────────────────────────────────────────
-- Waitlist (pre-launch email capture from landing/frontend)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE waitlist (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT NOT NULL UNIQUE,           -- stored lowercase; validated by API
  source       TEXT NOT NULL DEFAULT 'landing',
  locale       TEXT NOT NULL DEFAULT 'it',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
