# AIMETEO — Foundation Build Plan (Months 0–3)

> Operational plan derived from `meteo_ai_project.md` (strategy) and `AIMETEO_Backend_DeepDive_Roadmap_2026.pdf` (backend deep-dive).
> Goal of this phase: go from strategy doc → a shippable foundation. The user-visible product is **mountain-shaped**; the backend is **vertical-agnostic** from day one.
> Living document — leave dated notes when changing strategy.

---

## 0. North star for the phase

By end of Month 3 we want, in order of importance:

1. A **route database** with a clean, structured schema and a real seed set (Dolomiti + Lombardia + Piemonte). *This is the moat.*
2. A **backend skeleton** on GCP exposing four vertical-agnostic services: `forecast`, `terrain`, `briefing`, `alert`.
3. A **trip-planner pipeline** that is structured-data-first with hard safety filters Gemini cannot override.
4. A **landing page + waitlist** live, collecting demand and validating positioning.
5. **Legal**: lawyer engaged for T&Cs / disclaimer before any public plan output.

Guiding principle throughout: **AI for synthesis and language, never for facts.** Gemini decides what to *say*; structured data decides what's *true*.

> **Scope notes (2026-06-08):** (1) brand name decision **deferred** — proceed with `AIMETEO` / `Zerotermico` as working names. (2) **International expansion is on the roadmap** (Alpine market first: AT/CH/FR/SI, then broader). We stay Italian-only at launch for sharp positioning and speed, but build i18n and a country-agnostic data layer from day one so expansion is "new content, same plumbing" — not a rewrite. See §1a and §5.

---

## 1. Workstreams & sequencing

Five parallel tracks. Track A (Route DB) is the critical path — everything defensible depends on it.

| Track | Owner (to assign) | Critical path? | Blocks |
|---|---|---|---|
| A. Route DB (schema + curation) | Route DB owner (guide/alpinist) | **Yes** | Trip planner, briefings |
| B. Backend skeleton (GCP) | Backend eng | Yes | Everything runtime |
| C. Trip planner + safety filters | Backend eng + AI | No (needs A,B) | Pro launch |
| D. Landing page + waitlist | Product/design | No | — |
| E. Legal (T&Cs, disclaimer) | Founder + lawyer | **Yes for launch** | Any public plan output |

> Open decision (from strategy doc §10): **who owns the Route DB?** It is the moat and needs a dedicated owner, ideally a guide or experienced alpinist. Resolve in week 1.

### 1a. Built for international expansion (without diluting the Italy-first launch)

We launch Italian-only, but every layer is designed so adding a country = content + connectors, not a rewrite:

- **Country-agnostic data model.** Areas, routes and bulletins carry `country`, `locale`, and a generic `avalanche_service` + `avalanche_zone` (not hard-coded to AINEVA). See `route-db/schema.sql` v1.1.
- **EAWS as the common danger spine.** The avalanche danger scale (1–5) and problem types are the pan-European EAWS standard, so the safety engine is already cross-border; only the *source connector* changes per country.
- **Pluggable bulletin connectors.** Italy = AINEVA/Meteomont + ARPA. Expansion targets: Austria = LWD/Lawinenwarndienst, Switzerland = SLF, France = Météo-France/ANENA, Slovenia = ARSO. Same `avalanche_bulletin` table, different scrapers/APIs.
- **i18n from day one.** UI strings externalized; AI briefing prompt parametrized by language. *Relazione* tone is the Italian instance of a per-locale "guide voice."
- **Forecast + terrain are already global.** Google Maps Weather API and Earth Engine DEM cover all targets — no per-country work there.

**Expansion sequencing (indicative):** Phase 1 Italy → Phase 2 adjacent Alpine arc (AT/CH/FR border regions shared by Italian users) → later broader. Decide trigger by traction, not calendar.

---

## 2. Month-by-month

### Month 0–1 — Scaffolding
- **A**: Lock route schema v1 (this repo: `route-db/schema.sql` + `schema.md`). Seed 15–25 real routes across 3 areas. Define difficulty taxonomies (UIAA / BSA / EE-EEA) and aspect/exposure encoding.
- **B**: GCP project, Cloud Run hello-world API, Cloud SQL (Postgres + PostGIS), secrets, CI. Stub the four services with typed contracts.
- **D**: Ship landing page + waitlist (this repo: `landing/`). Start SEO long-tail page structure.
- **E**: Engage lawyer familiar with CAI / Collegio Guide Alpine framework around *"consiglio di gita."* Draft disclaimer skeleton.
- **Decision**: brand name + domain (see `branding/brand_shortlist.md`).

### Month 1–2 — Data in, briefings out
- **A**: Grow seed DB toward 100+ routes. Add per-route ideal-conditions windows + descent options.
- **B**: ETL pipeline: Google Maps Weather API baseline + ARPA regional bulletins (Piemonte, Lombardia, Veneto, Trentino, FVG, Valle d'Aosta). AINEVA/Meteomont scraper → structured danger vectors. Cloud Scheduler refresh every 1–3h. BigQuery historical store.
- **C**: Implement `briefing` service: forecast + bulletin + (optional webcam) → Gemini Flash → Italian *relazione*. Prompt v1 in `trip-planner/gemini_prompt_v1.md`.
- **D**: Wire waitlist to CRM/email; first SEO pages live.

### Month 2–3 — Trip planner alpha (internal)
- **A**: Terrain enrichment via Google Earth Engine DEM (slope, aspect per 50 m). Photos + recent reports fields populated.
- **B**: `terrain` + `alert` services. Webcam aggregator cached periodically.
- **C**: Trip-planner flow end-to-end behind a flag: intent → function-calling param extraction → backend filter/score/rank → **hard safety filters** → top-3 to Gemini → trip card. Never let Gemini see filtered routes.
- **E**: T&Cs finalized: plans are decision *support* not recommendation; final responsibility = party leader; official bulletin supersedes; gear is user's problem. Official AINEVA/Meteomont shown prominently with source link.

**Exit criteria for the phase:** internal users can ask for a *gita* in natural Italian and get a safe, accurate, source-attributed trip card; landing page converting waitlist signups; legal sign-off in hand.

---

## 3. Hard safety filters (non-negotiable, Gemini cannot override)

Implemented in backend before any candidate reaches the model:

- AINEVA danger = 4–5 on the route's aspects → route removed from candidates.
- Freezing level below valley altitude in summer → alpine routes filtered.
- Average wind > 60 km/h on exposed ridges → removed.
- (Deep-dive PDF) snow alert AND slope > 30°, or temp rise > 5° on S aspect → BLOCK.
- Gemini never sees filtered routes, so it cannot suggest them.

See `trip-planner/safety_filters.py` for the reference implementation.

---

## 4. Liability guardrails (apply to every surface)

- We **never publish our own danger ratings.** Aggregate + attribute official AINEVA/Meteomont only.
- Always show the official bulletin prominently with a link to source.
- AI translates technical bulletins into plain-language briefings; it does not assess danger.
- Immutable audit log (Cloud Logging, 10y retention): prompt sent, raw weather data, official bulletin in force, final response generated.
- Lawyer review of T&Cs + disclaimer is **pre-launch, not post.** Budget €2–3k.

---

## 5. Tech stack (locked for foundation)

- **Data**: Google Maps Weather API (baseline, global) · Google Earth Engine DEM (terrain, global) · **pluggable avalanche-bulletin connectors** behind one interface — IT: AINEVA + Meteomont + ARPA; expansion: AT (LWD), CH (SLF), FR (Météo-France/ANENA), SI (ARSO) — all normalized to the EAWS 1–5 scale · webcam aggregator. WeatherNext/GraphCast deferred to year 2+.
- **Intelligence**: Gemini 2.x Flash via Vertex AI. Grounding on provided context only. Function calling for trip planner.
- **Backend**: Cloud Run (API) · Cloud SQL Postgres + PostGIS (users, routes, cached briefings) · Vector search (pgvector or Vertex) for route similarity · Cloud Scheduler (refresh) · BigQuery (history) · Memorystore/Redis (edge cache) · Cloud Logging (audit).
- **Frontend**: Next.js webapp first (SEO + PWA). Native iOS/Android only after PLG validates (decide month 6).

---

## 6. Metrics & targets

| Milestone | Target |
|---|---|
| Month 6 | 5k registered users |
| Month 9 (Pro launch) | 1% conversion at 10k DAU ≈ €40k ARR run rate |
| Month 12 | 25k DAU, 2% conversion |
| Variable cost at 10k DAU | < €5k/month |
| Pro gross margin | ~93–95% |

---

## 7. What will actually decide if this works

1. Route DB quality and coverage (the moat).
2. CAI / guide-collegio credibility (distribution + legitimacy).
3. Trip planner that doesn't hallucinate (safety filters + structured-data-first).
4. Italian-first cultural fit (*relazione* format, real route names, dialect awareness).
5. Speed of bulletin → push notification (alert within minutes of an AINEVA upgrade).

---

## 8. Deliverables produced in this session

- `00_BUILD_PLAN.md` — this file.
- `branding/brand_shortlist.md` — name + domain options.
- `route-db/schema.sql`, `route-db/schema.md`, `route-db/seed_routes.json` — the moat, v1.
- `landing/index.html` — landing page + waitlist (single-file, deployable).
- `trip-planner/spec.md` — pipeline + function-calling contract.
- `trip-planner/safety_filters.py` — reference hard-filter implementation.
- `trip-planner/gemini_prompt_v1.md` — briefing prompt v1 (relazione style).

---

## Changelog
- **2026-06-08** — Initial foundation build plan derived from strategy doc + backend deep-dive. Defined 5 workstreams, month-by-month sequencing, safety/liability guardrails, session deliverables.
- **2026-06-08** — Brand name decision deferred. Added §1a international-expansion architecture (country-agnostic data model, EAWS danger spine, pluggable bulletin connectors, i18n from day one); updated §5 data layer accordingly.
