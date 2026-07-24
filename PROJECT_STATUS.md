# AIMETEO — Project Status & Next Steps

> Snapshot of everything built so far and what comes next.
> Last updated: **2026-07-12**. Living document.

**One-liner:** AI-native, Italy-first hyperlocal mountain-weather product for climbers,
ski-mountaineers and alpine hikers. The moat is the structured Italian route database +
hard safety filters — *not* the AI. Guiding law: **AI for synthesis and language, never
for facts.** Gemini decides what to *say*; structured data decides what's *true*.

Working brand name: **Zerotermico** (decision deferred). Positioning: *"Meteo per la
montagna, fatto bene."*

---

## 1. What exists today

### Strategy & planning
- `meteo_ai_project.md` — original strategy/working-memory doc (market, positioning, Free vs Pro, unit economics).
- `AIMETEO_Backend_DeepDive_Roadmap_2026.pdf` — backend deep-dive reference.
- `00_BUILD_PLAN.md` — actionable Months 0–3 foundation plan: 5 workstreams, month-by-month sequencing, safety/liability guardrails, **§1a international-expansion architecture**.
- `branding/brand_shortlist.md` — name options (Zerotermico / Cengia / Vetta), flagged Cresta.ai trademark risk and Mountain Maps/"MIA" as the closest direct competitor.

### Route database (the moat) — `route-db/`
- `schema.sql` — PostgreSQL + PostGIS schema v1.1. Vertical-agnostic *and* country-agnostic (country, locale, generic `avalanche_service`/`avalanche_zone`/`avalanche_subzone`). Separate official-bulletin cache, terrain samples, refuges, photos, community reports, and an immutable `plan_audit` log.
- `schema.md` — design notes + changelog.
- `seed_routes.json` — 5 real sample routes across 5 areas, mapped to **real EAWS region codes**. All flagged unverified (curation is the moat).

### Backend (FastAPI, Cloud Run-ready) — `backend/`
- Four **vertical-agnostic** services + planner + routes:
  - `GET /routes`, `GET /routes/{slug}`, `GET /routes/areas`
  - `GET /forecast/point` (mock → Maps Weather API)
  - `GET /terrain/{slug}` (mock → Earth Engine DEM)
  - `POST /briefing` (deterministic stand-in → Vertex/Gemini)
  - `POST /planner/plan` (structured-data-first + **hard safety filters**)
  - `POST /alert/subscribe` etc. (stub → Cloud Scheduler)
  - `GET /healthz`, CORS enabled for the frontend.
- ✅ **Route store is REAL Postgres** (`store_pg.py` + `db.py` + `scripts/seed_db.py`): runs against `schema.sql` (Cloud SQL-ready), idempotent seed upserts by slug, `DATABASE_URL` toggle — empty keeps the offline in-memory seed store (`store_memory.py`) behind the unchanged `store.py` facade. `/healthz` reports which backend is live.
- **Pluggable avalanche-connector interface** (`connectors/base.py`) normalizing every source to the EAWS 1–5 scale; resolved via `registry.py`.
- ✅ **AINEVA connector is REAL** (`connectors/aineva.py` + `connectors/caaml.py`): fetches official EAWS CAAML v6 JSON from the avalanche.report static mirror, parses danger ratings, per-aspect danger, problem types and verbatim text. `USE_MOCK_DATA` toggles live vs offline mock; off-season returns no bulletin cleanly.
- ✅ **Gemini briefings + planner relazione are REAL** (`llm.py` + `prompts.py`): Vertex AI
  generateContent via REST (ADC auth), enforced JSON `responseSchema` (briefing +
  `render_trip_plan` from spec.md), grounding-by-construction (the model sees ONLY the
  structured payload; missing data = "non disponibile", never invented). Fail-safe:
  any Gemini problem → deterministic stub, `model` field reports the truth. Gemini never
  sees blocked routes and is not called when zero candidates pass.
- ✅ **Forecast service is REAL** (`providers/google_weather.py`): Google Maps Weather API
  `currentConditions:lookup`, normalized to `PointForecast`. Freezing level is *derived*
  (standard 6.5 °C/km lapse rate from on-site temp + altitude) and disclosed in `source`.
  In-process TTL cache (~1 km geohash grid) + write-through to the Postgres
  `forecast_cache` table. Fetch/parse failures raise `ForecastFetchError` → endpoint 503,
  planner falls back to the *disclosed* mock (bulletin fail-closed path unaffected).
  Planner uses live per-route forecast once routes have real coordinates (GPX ingestion);
  until then `forecast_notice` disclosure stays on.
- ✅ **Terrain service wired for Earth Engine DEM** (`providers/earth_engine.py`):
  slope/aspect/elevation sampling (default `COPERNICUS/DEM/GLO30`, lazy optional
  `earthengine-api`). Requires real GPX track points — never fabricates coordinates;
  response `source` discloses `earth-engine-dem` vs `route-metadata` fallback.
- ✅ **Alert service is REAL logic** (Cloud Scheduler-ready): subscribe captures a
  server-side snapshot of the official bulletin; `POST /alert/run` (optional
  `X-Scheduler-Token`) diffs live vs snapshot and fires `new_bulletin` / `danger_up` /
  `bulletin_unavailable` (fail-closed messaging) events; baseline advances so changes
  fire once. `GET /alert/notifications?user_id=`. In-memory storage until auth lands.
- **Waitlist**: `POST /waitlist` (validated, lowercased, idempotent) → Postgres `waitlist`
  table (schema v1.3) or in-memory fallback; landing + frontend both post here.
- `Dockerfile`, `requirements.txt` (+ `google-auth`; `earthengine-api` optional),
  `.env.example`, `README.md`.

### Trip planner logic — `trip-planner/`
- `spec.md` — full pipeline (intent → param extraction → backend filter/score/rank → hard safety filters → top-3 → Gemini → trip card) + function-calling contracts + liability hooks.
- `safety_filters.py` — now a thin shim: the **canonical implementation lives in `backend/app/safety_filters.py`** (one copy, container self-contained — audit H2). Hard filters (Gemini cannot override): AINEVA 4–5 on route aspects, freezing level vs altitude, wind on exposed ridges, snow-alert + steep slope (unknown slope under alert = blocked), warming on the whole S/SE/SW sector, thunderstorms on exposed terrain. **Fail-closed (audit H1): missing/unfetchable bulletin in snow season = blocked, never "safe".**
- `gemini_prompt_v1.md` — briefing prompt v1 in Italian *relazione* style, with eval checklist.

### Frontend (Next.js MVP) — `frontend/`
- App-router webapp consuming the backend: home + route browser (`/`), route detail with forecast + AI briefing (`/routes/[slug]`), trip planner (`/planner`).
- ✅ **Server components for SEO**: `/` and `/routes/[slug]` render server-side
  (`revalidate: 300`) with `generateMetadata` producing Italian long-tail titles
  ("Meteo e condizioni — {route} | AIMETEO") from real API data. Interactive bits
  extracted to client components (`BriefingPanel`, `WaitlistSignup`).
- Planner renders the Gemini `plan` JSON as a structured trip card (official bulletin
  block prominent with link, `allerta_sicurezza` highlighted, `plan_model` provenance
  label); `plan_text` remains the fallback. Blocked routes with reasons unchanged.
- ✅ **Meteo-first home** (2026-07-01b): `GET /conditions` (per-area official bulletin
  status/danger + representative trailhead forecast, fail-safe statuses incl.
  "non verificabile") renders as the "Condizioni adesso" board at the top of the home
  page — the weather is now the interface, not a detail buried in route pages.
- ✅ **THE MAP IS THE LANDING PAGE** (2026-07-02): Windy-style product decision — `/`
  renders the full-viewport interactive map (CTA overlay → Itinerari / Pianifica);
  the route browser + conditions board + waitlist moved to `/itinerari`; `/mappa`
  307-redirects home. Leaflet + leaflet-velocity now **bundled via npm** (no CDN/CSS
  race → no flash of broken tiles), map chrome restyled to the site design system
  (cyan accents, dark popups/attribution/zoom controls, glassy pills).
- ✅ **Interactive map v2 — Windy-style** (2026-07-01c): full-bleed immersive
  map (CARTO dark default, OpenTopoMap "Terreno" toggle), **animated wind particles**
  (leaflet-velocity fed by a live Open-Meteo 15×9 model grid over the Alps, 10 m u/v),
  **radar timeline with play/scrub** (RainViewer past + nowcast frames, crossfaded
  tile layers), floating glassy controls + legend, real GPX tracks (white halo + blue
  line), trailhead markers colored by official avalanche danger with hover/popups.
  ⚠️ Open-Meteo free tier is non-commercial — add to the lawyer/licensing checklist
  (alternatives: their paid API, or self-rendered ICON/GFS tiles).
- Waitlist signup on the home page + landing form both POST to `/waitlist` with real
  error handling (422 vs network) — closes the audit-deferred "landing shows success
  even on failure" item.
- Route detail uses the real trailhead coordinates (+ start altitude) for the forecast
  panel once a GPX is ingested; "(dati dimostrativi)" label only when actually demo.
- Official AINEVA bulletin shown prominently with source link + decision-support disclaimer; planner surfaces *blocked* routes with reasons (the AI never sees them).
- `lib/api.js` client (+`serverFetch`, `postWaitlist`), env-driven `NEXT_PUBLIC_API_BASE`, `README.md`.

### Landing page — `landing/`
- `index.html` — deployable single-file Italian landing page with email waitlist capture (point `ENDPOINT` at a collector).

---

## 2. What's verified

- **Safety filters**: unit sanity checks pass (blocks danger-4 routes, storms on ferrate, passes calm days, **fail-closed on missing bulletin/slope, S/SE/SW warming**).
- **Fail-safe regression suite** (`backend/tests/test_failsafe.py`, 17 offline checks): connector raises `BulletinFetchError` on network/5xx/bad-JSON (never silent None), prev-day fallback links the file actually served, expired bulletins not served as in force, planner blocks all snow routes when the bulletin is unverifiable, container-import simulation passes.
- **CAAML parser**: tested against **real fetched AINEVA data** (saved fixture) — danger mapping, per-aspect derivation, micro-region selection, unknown-subzone fallback, synthetic high-danger blocking, off-season → None.
- **Live connector path**: builds the exact mirror URL, parses real JSON, 404 → previous-day fallback then None.
- **Postgres store**: 28-check integration test (`backend/tests/test_store_pg.py`) — schema applies, seed loads twice (idempotent), Postgres store returns identical shapes to the seed store, and `/routes`, `/briefing`, `/planner/plan` all pass over a live Postgres connection. Also runs on Postgres without PostGIS (geometry shimmed) for CI sandboxes.
- **Backend ↔ frontend contract**: every endpoint the frontend calls returns the expected shape; CORS preflight passes.
- **Integration suite** (`backend/tests/test_integrations.py`, 66 offline checks, all mocked):
  Gemini fail-safe (unconfigured/down → deterministic stub, honest `model` field), payload
  grounding (official danger/source/text verbatim, `non disponibile` for missing data,
  blocked routes never reach Gemini, no call with zero candidates); Weather API response
  normalization against the real documented shape, lapse-rate freezing level + disclosure,
  cache, fail-safe 501/503 paths; terrain metadata fallback + aspect math + no-coordinates
  refusal; alert snapshot/diff/re-fire suppression/fail-closed messaging/token guard;
  waitlist validation/idempotency; all routers mount.
- **Frontend**: all JSX/JS parses cleanly (esbuild); landing script passes `node --check`.
- End-to-end demo behaviour: with a danger-3 bulletin on N/NE + steep slopes, the planner correctly returns **0 safe / 2 blocked** and says "rimanda" instead of recommending.

---

## 3. Liability guardrails (always on)

- Never publish our own danger ratings — official AINEVA/Meteomont only, with source link.
- Plans are **decision support**, not recommendation; final responsibility = party leader; official bulletin supersedes.
- Immutable audit log (prompt + raw weather + bulletin in force + final response).
- Unverified routes excluded from planner candidates.
- Lawyer review of T&Cs / disclaimer is **pre-launch** (budget €2–3k) — still outstanding.

---

## 4. Next steps

### Immediate engineering (make it real, in priority order)
1. ✅ ~~**Route store → Cloud SQL (Postgres + PostGIS)**~~ — DONE 2026-06-09. Ops step remaining: provision Cloud SQL, run `scripts/seed_db.py --schema`, set `DATABASE_URL` on Cloud Run.
2. ✅ ~~**Vertex AI / Gemini briefings**~~ — DONE 2026-07-01 (code-complete, fail-safe). Ops step remaining: GCP project + ADC/service-account on Cloud Run, set `GCP_PROJECT`/`VERTEX_LOCATION`, `USE_MOCK_DATA=false`; then run the manual eval checklist in `gemini_prompt_v1.md` with a guide before exposing generated text.
3. ✅ ~~**Forecast service → Google Maps Weather API**~~ — DONE 2026-07-01. Ops step remaining: enable Weather API + set `MAPS_WEATHER_API_KEY`. Per-route live forecasts additionally need real route coordinates → unblocked by GPX ingestion (item 4a).
4. ✅ ~~**Terrain service → Earth Engine DEM**~~ — DONE 2026-07-01 (code-complete behind optional `earthengine-api`).
   4a. ✅ ~~**GPX ingestion pipeline**~~ — DONE 2026-07-01 (`app/gpx.py` + `scripts/ingest_gpx.py`). Parser (stdlib, GPX 1.0/1.1, trkpt/rtept), ~50 m decimation (selects real points, never interpolates), altitude sanity gate against the curated scheda (±150 m; `--force` for the curator), writes Postgres (`start_point`/`summit_point`/`track`/`route_sample`) *and* the seed JSON; `store_pg` exposes `start_lat`/`start_lon` + `track_points` (PostGIS-aware, bare-Postgres CI still works). Planner drops the mock-forecast notice for ingested routes; terrain DEM sampling unblocked.
   **Remaining: the DATA, not the code — collect real GPX tracks for the seed routes (curator/guide task): `python scripts/ingest_gpx.py <file.gpx> --route <slug>`.**
   First real ingestions done 2026-07-01 from Camptocamp (CC **BY-SA** — attribution embedded in each GPX under `route-db/gpx/`; share-alike implications for the route DB are a question for the lawyer engagement):
   - **Gran Paradiso via normale** (c2c 53835): 154 pts / 16.6 km / D+ 2080 m; gate passed (start 1989 vs 1960, max 4020 vs 4061). End-to-end UI verified: route page server-renders with SEO metadata and the forecast panel requests the REAL trailhead (45.524651, 7.200858, alt 1960) instead of demo coords.
   - **Marmolada dalla Fedaia** (c2c 1089182): 100 pts / 11.6 km / D+ 1222 m; gate passed (start 2079 vs 2050, max 3268 vs 3343). Curator note: track follows the east-ridge (forcella 3294) variant to Punta Penia.
   - **Skipped (no usable open track, gate not forced):** Monte Vioz (c2c route exists, no geometry), Tofana Punta Anna (only a different-itinerary traverse has geometry), Rifugio Coca (no Camptocamp coverage in the Orobie). Curator sources for these: own recordings, CAI partners, or OSM relations (ODbL).
5. ✅ ~~**Alert service → Cloud Scheduler**~~ — DONE 2026-07-01 (diff job + token guard). Ops step remaining: create the Scheduler job → `POST /alert/run` (OIDC or `SCHEDULER_TOKEN`); push delivery + DB persistence land with the auth layer.
6. ✅ ~~**Frontend → server components + waitlist**~~ — DONE 2026-07-01. Still open: dedicated long-tail "meteo + [rifugio/cima]" landing pages beyond route detail.

### Data / moat (the thing that actually wins)
7. **Route DB curation** — grow toward 100+ across Dolomiti/Lombardia/Piemonte; assign a dedicated owner (guide/alpinist).
   ✅ 2026-07-02: **20 routes** (5 curated seed + **15 imported from Camptocamp** via the new
   `backend/scripts/import_c2c.py` — bbox-constrained to the 5 existing areas so avalanche
   zones stay correct; every value verbatim from the c2c API, CC BY-SA attribution in
   `source`, ALL flagged `verified_at: null`). **Curator task: verify these 15** (names,
   grades, elevations, aspects) and add `max_slope_deg` where missing — unverified routes
   have no slope data, so under a snow alert they are blocked fail-closed.
8. **Pin exact micro-regions** per route (Marmolada, Gran Paradiso, Ampezzo currently use the conservative whole-region fallback).
9. **Broaden AINEVA coverage** (all Italian regions + Meteomont) and add per-route GPX + photos + recent reports.

### Backlog prodotto (idee registrate)
- **Ricerca località** (idea Michele, 2026-07-11): search box in home → geocoding
  (Open-Meteo geocoding API, gratuita) → pagina località con (a) meteo della
  settimana (meteogramma già esistente al punto), (b) itinerari e falesie VICINE
  (raggio haversine su route-db, ordinati per distanza + fattibilità: stagione,
  filtri sicurezza, sole/ombra per le falesie). SEO naturale: "/localita/cortina"
  = pagina long-tail per ogni paese di montagna. Effort: medio-basso, quasi tutto
  riusa componenti esistenti.

- **Heatmap delle condizioni** (idea 2026-07-12, da analisi Strava/Komoot): layer
  mappa che colora il territorio non per popolarità (heatmap Strava = dove va la
  gente) ma per CONDIZIONI calcolate dal Modello Zerotermico: sole sul versante,
  zero termico vs quota, vento, "dove si sta bene adesso/domani". Stessa seduzione
  visiva della heatmap, ma fisica invece di folla — nessun competitor la ha, e non
  richiede massa di utenti (vantaggio del cold start). Base tecnica: griglia di
  punti sul viewport + solar.py/profile.py già esistenti; v1 possibile come
  estensione del layer temperatura sulla mappa. Da valutare costo API per griglie
  fitte (cache aggressiva per tile).

### Business / go-to-market
10. **Lawyer engagement** for T&Cs + disclaimer (pre-launch, non-negotiable).
11. **Brand name + domain** decision (Zerotermico vs Cengia vs Vetta) + UIBM/EUIPO check.
12. **CAI section partnerships** (start with 3–5) for distribution + credibility.
13. Ship landing page + waitlist; begin SEO long-tail pages.

### Expansion (later, already architected for)
14. Add adjacent verticals on the shared backend (trail running, paragliding, then cycling).
15. International: add EAWS connectors (AT=LWD, CH=SLF, FR=ANENA, SI=ARSO) — one file + one `register()` each; the safety engine is already EAWS-cross-border.

### Open decisions (from strategy doc §10)
- Route DB owner · first MVP region · iOS/Android timing · founding-team split · funding · Italian-only vs EN from day one.

---

## 5. How to run (local)

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env            # USE_MOCK_DATA=true for offline; false for live AINEVA
uvicorn app.main:app --reload   # http://localhost:8000/docs

# Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                     # http://localhost:3000

# Tests
cd backend && python tests/test_caaml.py && python tests/test_failsafe.py \
  && python tests/test_integrations.py && python tests/test_gpx.py \
  && python ../trip-planner/safety_filters.py

# Ingest a real GPX for a route (unlocks live forecast + DEM for that route)
python scripts/ingest_gpx.py path/to/track.gpx --route <slug> [--dry-run]
# Postgres integration test (needs any empty Postgres; PostGIS optional)
DATABASE_URL=postgresql://... python tests/test_store_pg.py

# Optional: real DB locally (Docker) instead of the in-memory store
docker run -d -e POSTGRES_USER=aimeteo -e POSTGRES_PASSWORD=aimeteo -e POSTGRES_DB=aimeteo \
  -p 5432:5432 postgis/postgis:16-3.4
export DATABASE_URL=postgresql://aimeteo:aimeteo@localhost:5432/aimeteo
python backend/scripts/seed_db.py --schema
```

---

## Changelog
- **2026-07-12(b) — Sprint prodotto + REBRANDING**: (1) **Tempi di percorrenza**
  (metodo svizzero/CAI, deterministico): model/timing.py + 22 test, campo `tempi`
  su /routes, card e scheda ("⏱ 4h30 · 12 km", parametri dichiarati, soste escluse).
  (2) **Layer pendenze fatto in casa**: OpenSlopeMap ESCLUSA (licenza solo uso
  privato); pipeline propria Copernicus DEM→gdaldem→tile XYZ statici
  (scripts/build_slope_tiles.py, area pilota Valcamonica; toggle "Pendenze"
  appare solo se i tile esistono; attribuzione + disclaimer risoluzione).
  (3) **Home ibrida Windy×weather-app**: search bar sulla mappa + striscia 7
  giorni al centro mappa (si aggiorna al moveend). (4) **REBRANDING ZEROTERMICO**:
  tagline ufficiale "Il meteo alla tua quota." (decisione Michele); monogramma 0°
  (SVG navbar `zero°termico` + app icon PIL 512/192/maskable/apple); manifest,
  metadata, backend title; identità completa in branding/BRAND_ZEROTERMICO.md
  (soprannome "Zero", voce capogita, naming feature: la Finestra, il Semaforo).
  (5) Launcher locale ora LIVE (geocoding/meteo veri senza chiavi).
- **2026-07-12 — Pre-deploy sprint**: (1) **Ricerca località** (`/localita` +
  backend `/localita/{search,settimana,vicino}`): geocoding Open-Meteo, settimana
  0-100 (riusa scoring finestra), itinerari+falesie entro 25 km per distanza
  haversine (da Vezza d'Oglio: Sentiero 16 a 0.4 km); mock = centroidi aree,
  link condivisibile `?q=`. (2) **`/privacy`** GDPR-base (waitlist + push, titolare,
  diritti) — obbligo pre-tester; link footer. (3) **`DEPLOY.md`**: checklist
  weekend (Cloud Run + Vercel + dominio + quote/licenze + smoke test + primi
  tester). Import Alta Valcamonica COMPLETO: 38 sentieri area (68 totali DB),
  34A Monte Aviolo incluso; push su GitHub ok (fix scope workflow), CI attiva.
- **2026-07-11(g) — Sprint best-practice + prodotto**: (1) **CI GitHub Actions**
  (`.github/workflows/ci.yml`): a ogni push le 5 suite di test + build Next contro
  backend mock. (2) **Validazione schedulata** (`validate-model.yml`): cron lun notte
  + gio mezzogiorno, committa VALIDATION_LOG.md da solo (anche manuale da Actions).
  (3) **Pagina `/fonti`**: attribuzioni ODbL/CC BY-SA/Open-Meteo/AINEVA/BZ (obbligo
  di licenza) + "cosa non facciamo mai"; link nel footer. (4) **Finestra migliore
  della settimana**: `GET /routes/{slug}/finestra` — punteggio 0-100/giorno alla
  quota vetta reale (pioggia, vento, nuvole, freddo, zero termico) + finestra oraria
  + sole sul versante (solo con pendenza/esposizione note); card sulla pagina rotta,
  fail-safe (endpoint giù → card assente). (5) **Condivisione piano**: `/planner?i=…&a=…`
  auto-esegue, bottone "Condividi col compagno di gita" — il piano è sempre
  ricalcolato all'apertura, mai congelato. (6) **Push PWA**: sw v3 con handler
  push/notificationclick, `/push/subscribe` + `/push/send-test` (pywebpush opzionale,
  chiavi VAPID da env via `scripts/gen_vapid.py`), bottone "Avvisami" — consegna
  reale al deploy (serve HTTPS). Fix: USE_MOCK_DATA richiede "true", non "1".
- **2026-07-11 (f)** — **Validazione modello + verticale falesie.**
  (1) Prima validazione vs 8 stazioni reali in quota (BZ open data, conversione
  UTM32N aggiunta): profilo puro MAE 2.24° con bias freddo sistematico diurno
  (strato superficiale surriscaldato che il profilo ignora); baseline om-2m 1.18°.
  **Decisione data-driven (v0.1)**: T puntuale da om-2m downscalata alla quota
  reale; profilo = autorità per zero termico/inversioni; solare per warming.
  Log in docs/VALIDATION_LOG.md — da rilanciare di notte e in inverno.
  (2) **Falesie v1**: entità `route-db/crags.json`, servizio `/falesie` con
  **sole/ombra per parete** (slope 90° + esposizione reale, soglia 120 W/m²,
  finestre della giornata al quarto d'ora; esposizione ignota → dichiarato,
  mai inventato), `scripts/import_osm_crags.py` (sport=climbing, orientation,
  quote OSM `ele` o DEM, ODbL), pagina `/falesie` + nav. Test fisici inclusi
  (S > N per durata di sole). Suite verdi.
- **2026-07-11 (e)** — **+10 sentieri CAI dal catasto REI via OSM** (`import_osm_cai.py`,
  lanciato da Michele dal Mac dopo i fix robustezza Overpass: skip-non-abort, retry,
  timeout 120s). Seed a **30 rotte** (14 escursionismo, tutte con traccia reale + quote
  dal DEM Copernicus, attribuzione ODbL, unverified). Tra i nuovi: Alta Via 2 VdA
  tappa (125 pt), Orobie Orientali tappe 1-2, Friedrich August, ferrata Gino Badia,
  sentiero attrezzato Minazio. Gate al lavoro: scartato un sentiero fuori bbox.
  Verificato: /weather sui nuovi sentieri (profilo alle quote reali), /gpx con ODbL
  nel file, planner escursionismo con 14 candidati. Tutte le suite verdi.
- **2026-07-11 (d)** — **Modello v0 collegato ai dati.** Provider
  `providers/open_meteo.py`: colonna verticale (T + quota geopotenziale a
  1000/925/850/700/500 hPa) + nuvolosità, parser tollerante testato su fixture,
  `ColumnFetchError` fail-safe, colonna mock invernale etichettata per l'offline.
  `route_weather` v2: T di ogni punto letta dal profilo alla quota REALE (non più
  dal grid), zero termico dal profilo, sezione `model` nella risposta (fonte,
  inversione con strati, nuvolosità, **warming_onset per esposizione** — solo se
  la pendenza è nota, mai inventata; fail-safe: colonna giù → model=null, si
  tiene il provider). Payload Gemini: blocco MODELLO (zero termico dal profilo,
  inversioni, orari di riscaldamento). `source` dei punti dichiara la catena
  ("provider + profilo fonte"). Licenza Open-Meteo non-commerciale: dev/validazione
  ok, al lancio serve il piano a pagamento (in checklist legale). Suite verdi.
- **2026-07-11 (c)** — **Modello Zerotermico v0 — nucleo fisico** (`backend/app/model/`,
  fisica pura, zero I/O, 34 check esatti in `tests/test_model.py`).
  `solar.py`: declinazione/equazione del tempo (Spencer 1971), posizione solare
  (atan2, niente bug di quadrante), air mass (Kasten-Young), DNI clear-sky (Meinel,
  con correzione quota), attenuazione nuvole (Kasten-Czeplak), irradianza su pendio
  inclinato per esposizione, **warming_onset**: "a che ora il pendio X si scalda"
  (proxy neve bagnata; demo 15 feb: SE 07:15, E 07:30, S 07:45 UTC, NW mai).
  `profile.py`: T(z) interpolata dal profilo ai livelli di pressione (estrapolazione
  limitata, mai numeri inventati fuori colonna), **rilevamento inversioni** (il caso
  in cui il gradiente standard sbaglia di 5-10°), zero termico letto dal profilo con
  TUTTE le intersezioni riportate (inversioni ⇒ multiple) e flag colonna sotto zero.
  Test: solstizi ±23.44°, culmine a Sud, parete N 40° MAI illuminata a dicembre,
  Est si scalda prima di Sud, equinozio 12h, ecc. Prossimi: plumbing dati livelli
  di pressione (Open-Meteo pressure levels), integrazione in route_weather e nel
  filtro warming, poi hindcast vs stazioni Meteomont/ARPA (claim di skill SOLO dopo
  validazione).
- **2026-07-11 (b)** — **Differenzianti dal report competitivo (top-2 del piano).**
  (1) **Meteo lungo l'itinerario a quota reale**: `GET /routes/{slug}/weather` campiona
  partenza / metà salita (per quota, non per distanza — le tracce A/R ingannano) / vetta
  ai punti REALI della traccia con le loro quote vere (il gap documentato di Windy:
  quota del grid ≠ quota della cima). Strip sulla pagina rotta; il payload Gemini ora
  include "zero termico in vetta". Mock con gradiente standard, dichiarato; 404 senza
  traccia. Demo: partenza 1990 m −6°, metà 3022 m −13°, vetta 4020 m −19°.
  (2) **Offline reale**: service worker v2 (cache API cross-origin network-first,
  protocollo CACHE_URLS) + bottone "Salva per offline" sulla pagina rotta che precache
  scheda+meteo+GPX+condizioni+tiles del riquadro traccia (z11-13, cap 350) — uso in
  rifugio senza rete, ultima copia buona mai spacciata per fresca. Suite verdi.
- **2026-07-11** — **Sprint quick-wins (da analisi concorrenti: Skitourenguru, White Risk,
  Whympr, Komoot).** (1) **Profilo altimetrico** SVG server-rendered sulla pagina rotta
  (dai track_points reali, zero librerie). (2) **Export GPX** `GET /routes/{slug}/gpx`
  con attribuzione della traccia embedded (nuovo campo `track_source` — provenienza
  della traccia distinta dalla scheda; `ingest_gpx.py --track-source`); roundtrip
  testato col nostro stesso parser; 404 senza traccia, mai geometria inventata.
  (3) **Meteogramma 7gg** client (Open-Meteo hourly: temperatura, zero termico,
  precipitazioni) al trailhead reale. (4) **PWA**: manifest + icone (montagna brand)
  + service worker conservativo (tiles cache-first bounded, API network-first) →
  **app installabile standalone** (Chrome ⋮ → "Installa AIMETEO"; Safari → Aggiungi
  al Dock) — risponde alla richiesta "app senza browser". Roadmap post-GCP annotata:
  layer pendenza >30° + semaforo per-tratto stile Skitourenguru con AINEVA.
  Suite verdi; pagina rotta verificata con screenshot headless.
- **2026-07-09** — **Aesthetic coherence pass (da screenshot reale).** Temp field:
  griglia allargata (11×20, 220 punti), bordi sfumati (feathering alpha 9%) — niente più
  rettangolo netto; mappa vincolata alle Alpi (maxBounds+minZoom). Legenda temperatura ora
  mostra il gradiente del range REALE min→max. Tutti i controlli su mappa unificati in
  vetro chiaro (pillole, CTA, zoom, timeline, legenda, attribution); marker itinerari →
  divIcon con anello pulsante; logo → montagna pulita. Fix: il warning "dati live non
  raggiungibili" non viene più cancellato dal clear di fine caricamento. Verifica: loop
  visivo headless nel sandbox (chromium-headless-shell + stub libXdamage; tiles esterni
  bloccati dal proxy ma il chrome è verificabile via screenshot). Suite verdi.
- **2026-07-03** — **Planner seasonality gate.** Per-activity plannability windows
  (`ACTIVITY_SEASON_MONTHS`: scialpinismo nov–mag, ferrate apr–nov, alpinismo/
  escursionismo tutto l'anno) applied BEFORE bulletin/forecast work; excluded routes
  land in `blocked` with an explicit "fuori stagione" reason and stay browsable.
  Curator override per route via `season_months` (seed) — tested. July behaviour:
  scialpinismo 0 safe / 11 blocked (seasonality), ferrate 4 safe, escursionismo 4 safe.
  Planner test sections anchored to fixed months (no more calendar-dependent tests);
  counts derived from the store. All suites green.
- **2026-07-02** — **Seasonal avalanche UI + route import + map-first UX.** (a) Valanghe
  fuori stagione: season-aware demo bulletin (giu–ott = none, like real AINEVA), briefing
  works without a bulletin (`Briefing.bulletin` Optional, no more 409), all avalanche
  chrome (badges, legend, popups, notes) hidden when no bulletin is in force — the
  "non verificabile" safety warning always shows. Mock planner forecast now follows the
  real calendar (fixed spurious winter blocks in July); `test_failsafe` made seed-size
  independent + forces winter for the fail-closed check. (b) **+15 routes from
  Camptocamp** (`scripts/import_c2c.py`, verbatim-only, unverified, CC BY-SA) → 20 total.
  (c) UX: click su itinerario con traccia → mappa zoomata sul tracciato con popup
  (`/?route=<slug>` deep link); design system v2 ("notte alpina": Manrope, glass nav,
  refined cards/buttons); map landing with temperature color field + wind particles on
  by default. All suites green.
- **2026-07-01 (b)** — **#4a GPX ingestion pipeline done.** `app/gpx.py`: stdlib parser (namespace-tolerant, trkpt→rtept fallback, ele optional and never estimated), haversine, ~50 m *decimation* (every output point exists verbatim in the input — selection, not interpolation), track stats. `scripts/ingest_gpx.py`: CLI with wrong-file protection (GPX start/max elevation must match the curated scheda within ±150 m; `--force` = curator override), idempotent writes to Postgres (`start_point`, `summit_point` from highest GPX point, `track` LINESTRINGZ, `route_sample` rows; slope/aspect left NULL for the Earth Engine pass) and to `seed_routes.json` (`start_lat`/`start_lon`/`track_points`). `store_pg` v2: runtime PostGIS detection (CI shim keeps working), exposes coordinates + track_points. Planner now genuinely drops `forecast_notice` for ingested routes; on live fetch failure the disclosed mock returns (tested). New `tests/test_gpx.py` (30 checks) + CLI smoke; all suites green. **Remaining is data: real GPX files for the 5 seed routes.**
- **2026-07-01** — **Next steps #2–#6 code-complete: all live integrations wired, fail-safe by construction.**
  (a) **Gemini/Vertex** (`llm.py`, `prompts.py`): REST + ADC, enforced JSON schemas (briefing + `render_trip_plan`), grounded payloads ("non disponibile" for missing data), deterministic-stub fallback with honest `model`/`plan_model` reporting; planner logs the liability audit payload (prompt + candidates + response).
  (b) **Forecast** (`providers/google_weather.py`): Maps Weather API normalization, disclosed lapse-rate freezing level, geohash TTL cache + `forecast_cache` write-through, `ForecastFetchError` fail-safe; planner per-route live forecast plumbing (`start_lat/start_lon`) with mock+notice fallback — notice now conditional (M1 closes fully with GPX ingestion).
  (c) **Terrain** (`providers/earth_engine.py`): DEM slope/aspect sampling behind optional `earthengine-api`, `source` discloses `earth-engine-dem` vs `route-metadata`; never fabricates coordinates.
  (d) **Alerts**: server-side bulletin snapshot at subscribe, `POST /alert/run` diff job (Scheduler-ready, `X-Scheduler-Token`), fires `new_bulletin`/`danger_up`/`bulletin_unavailable` (fail-closed), baseline advance, per-user notifications.
  (e) **Waitlist**: `POST /waitlist` + `waitlist` table (schema v1.3), landing + frontend wired.
  (f) **Frontend**: `/` and `/routes/[slug]` are server components with `generateMetadata` (SEO), client islands extracted; planner renders the structured Gemini trip card with prominent official-bulletin block.
  Models extended (`PlanResponse.plan/plan_model`, `TerrainProfile.source`, `AlertSnapshot`/`AlertEvent`); `google-auth` added. **Verified**: new 66-check `tests/test_integrations.py` + caaml + failsafe + safety ×2 all green; frontend esbuild + landing `node --check` clean. store_pg suite unchanged (needs a live Postgres; was green 06-09).
  **New top engineering priority: GPX ingestion (#4a)** — unlocks live per-route forecast, DEM sampling, and removes the mock-forecast notice.
- **2026-06-09 (d)** — **Audit cleanup: M1, M6, L items.** M6: planner now memoizes the bulletin per `(service, zone, subzone)` per request (N routes in a region = 1 GET; fetch errors cached too). M1: `PlanResponse.forecast_notice` discloses the mock forecast in API + planner UI until the forecast service is wired. L: registry failures → 503 (planner & briefing), forecast → 501 in live mode, `/alert/subscriptions` scoped to a required `user_id` (no full-list dump), briefing `model="deterministic-stub"`, CORS env-driven via `CORS_ORIGINS`, removed unused `aineva.LANG`. Deferred (not bugs): landing demo waitlist behaviour, Gran Paradiso scale tag (curator call). All suites green (caaml, failsafe, safety ×2, store_pg 28-check, esbuild).
- **2026-06-09 (c)** — **Full-code audit + critical fixes** (`AUDIT_2026-06-09.md`). Fixed: **H1** safety filters now fail CLOSED (snow activity + snow season + missing/unfetchable bulletin → blocked; new `BulletinFetchError` distinguishes "fetch failed" from "no bulletin in force"); **H2** canonical safety filters moved into `backend/app/safety_filters.py` (container self-contained, `trip-planner/safety_filters.py` is a re-export shim); **M2** prev-day bulletin fallback now links the file actually served, handles errors, rejects expired bulletins; **M3** NULL `max_slope_deg` no longer crashes the planner (unknown slope under snow alert = blocked); **M4** warming filter covers S/SE/SW; **M5** route page forecast loads again. New `tests/test_failsafe.py` (17 checks). Open from audit: M1 (planner still uses mock forecast), M6 (bulletin caching), L items.
- **2026-06-09 (b)** — **Next step #1 done: real Postgres route store.** Schema v1.2 (`area.slug`/`refuge.slug` natural keys; `start_point` nullable until GPX ingestion — never fabricate coordinates). New: `backend/app/db.py` (psycopg pool), `store_pg.py`, `store_memory.py`, `store.py` facade (`DATABASE_URL` toggle), `scripts/seed_db.py` (idempotent), `tests/test_store_pg.py` (28 checks passing incl. full API contract over live Postgres; in-memory fallback + CAAML + safety-filter tests still green). API contract unchanged — frontend untouched.
- **2026-06-09** — Created this status doc. Captures: strategy/plan, branding, country-agnostic route DB schema + seed, FastAPI backend (4 services + planner + routes), real AINEVA/CAAML connector (tested), trip-planner spec/filters/prompt, Next.js frontend MVP, landing page. Listed prioritized next steps.
