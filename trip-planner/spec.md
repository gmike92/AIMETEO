# Trip Planner — pipeline spec v1

The single most important Pro feature. Compresses 1–2 hours of expert planning into 5 minutes, **without hallucinating routes, refuges, or danger.** One hallucinated route on exposed terrain kills the brand.

## Core principle
**AI for synthesis and language, never for facts.** Gemini decides what to *say*; structured data decides what's *true*. Gemini never invents a route, never sees a filtered-out route, and never authors a danger rating.

## Flow

```
1. INTENT (free Italian text)
   "Vorrei una gita scialpinistica in Dolomiti questo weekend,
    livello BSA, partenza da Cortina, durata mezza giornata."
        │
        ▼
2. PARAM EXTRACTION  — Gemini function calling → structured PlanRequest
        │
        ▼
3. BACKEND (NO AI):
     a. filter route DB by activity, area, difficulty, duration, start proximity
     b. fetch forecast (forecast_cache / Maps Weather API) per candidate
     c. fetch official AINEVA/Meteomont bulletin for each route's zone
     d. score & rank candidates by conditions fit
     e. APPLY HARD SAFETY FILTERS (safety_filters.py) ── removes unsafe routes
        │
        ▼
4. TOP 3 safe candidates + their REAL data → Gemini
        │
        ▼
5. Gemini writes the plan in Italian *relazione* style (prompt v1)
   → returns structured JSON (function-calling enforced)
        │
        ▼
6. OUTPUT = trip card. Saveable, shareable, modifiable
   ("e se invece partissi domenica?")
        │
        ▼
7. AUDIT: write plan_audit row (prompt, raw weather, bulletin in force, response)
```

Steps 3a–3e are deterministic backend. Gemini appears only at 2 (extract) and 5 (narrate).

## Function-calling contract

### `extract_plan_request` (step 2 — Gemini → backend)
```json
{
  "activity": "scialpinismo",
  "area": "Dolomiti",
  "start_location": "Cortina d'Ampezzo",
  "date_range": { "from": "2026-06-13", "to": "2026-06-14" },
  "max_difficulty": "BSA",
  "duration": "mezza_giornata",
  "party": { "size": 1, "min_level": "BSA" },
  "constraints": []
}
```

### `render_trip_plan` (step 5 — backend → Gemini, enforced output schema)
Gemini MUST return exactly this JSON (no prose outside it):
```json
{
  "titolo": "string",
  "itinerario": "string (relazione: avvicinamento, salita, vetta, discesa)",
  "timing": {
    "alba": "HH:MM",
    "partenza_consigliata": "HH:MM",
    "vetta_entro": "HH:MM",
    "rientro_stimato": "HH:MM"
  },
  "condizioni": "string (sintesi meteo sull'itinerario)",
  "bollettino_valanghe": {
    "grado_ufficiale": "1-5",
    "fonte": "AINEVA | Meteomont",
    "link": "url",
    "sintesi": "string (parafrasi, MAI un giudizio nostro)"
  },
  "equipaggiamento_consigliato": ["string"],
  "punti_decisionali": ["string"],
  "piano_b": "string (bail-out / alternativa)",
  "allerta_sicurezza": "string | null"
}
```

## Hard safety filters (step 3e — Gemini cannot override)
Implemented in `safety_filters.py`. A route failing ANY rule is removed from candidates:
- AINEVA 4–5 on the route's aspects → removed (snow activities).
- Freezing level below start altitude in summer → alpine routes filtered.
- Avg wind > 60 km/h on exposed ridges → removed.
- Snow alert (danger ≥3) AND max slope > 30° → removed.
- Temp rise > 5°C on S aspect → removed (wet snow / rockfall).
- Thunderstorm prob > 40% on exposed terrain → removed (lightning).

Because Gemini never receives filtered routes, it cannot suggest them.

## Pro planner ladder (roadmap)
Multi-day weekend planning · 3 ranked alternatives · "Piano B" if weather degrades ·
group planning (mixed levels) · PDF/GPX export · post-trip GPX ingestion → personalization ·
**"Avvisami se cambiano le condizioni"** (push if forecast/bulletin shifts after the plan is generated — the moment a free user becomes Pro forever).

## Liability hooks (must hold on every plan)
- Official AINEVA/Meteomont bulletin shown prominently with source link.
- Plan framed as decision *support*, not recommendation; final responsibility = party leader; official bulletin supersedes.
- Every generated plan writes an immutable `plan_audit` row.
- Unverified routes (`verified_at IS NULL`) excluded from candidates.

## Changelog
- **2026-06-08** — Pipeline v1: flow, function-calling contracts, safety-filter integration, liability hooks.
