# Meteo AI — Working Memory

> Shared planning doc. Living document — edit freely, leave dated notes when changing strategy.

**One-liner:** AI-native, Italy-first hyperlocal weather product, starting with the mountain vertical (climbers, ski-mountaineers, alpine hikers), expanding via shared backend to adjacent verticals later.

---

## 1. Market opportunity

- **ilMeteo S.r.l.** (Padova) — €12.97M revenue, €4.48M profit in 2024, only 14 employees. This is the benchmark for "weather as a business in Italy."
- Note: "Meteo.it" (Meteo Italia S.r.l., Milano) is a different, much smaller company (€331K revenue 2024). The €15M figure refers to ilMeteo.
- ilMeteo is fundamentally an **ad-supported media business**: ~1M daily uniques, 25 years of compounding SEO and brand.
- The moat is **traffic and brand**, not technology. AI alone does not unseat them.

**Implication:** don't attempt a frontal assault on generic Italian weather. Find a niche where users have urgent need + willingness to pay.

---

## 2. Strategic positioning

**Pick one vertical, win it, then expand. Do not launch as a "platform."**

### Phase 1 (months 0–9): Mountain only
- Climbers (alpinismo, vie ferrate, falesie)
- Ski-mountaineers (scialpinismo)
- Serious hikers / trekking
- These three overlap heavily — same person across seasons. Same data infrastructure serves all.

### Phase 2 (months 9–18): Expand within mountain
- Trail running, MTB alpino, paragliding (volo libero)
- Same backend, near-zero new infra cost.

### Phase 3 (year 2+): One adjacent vertical
- **Strongest candidate: cycling (road + gravel)** — huge in Italy, weather-sensitive, Strava integration, hyperlocal wind matters.
- Surf is tempting but probably wrong: small Italian market, Windguru is free and excellent, totally separate data stack (wave models, buoy data).
- B2B option: **agriculture / vineyards** — real budgets, hyperlocal microclimate is exactly what they need.

**Architectural rule:** build the backend modular and vertical-agnostic from day one (forecast service, terrain service, briefing service, alert service). But the *product the user sees* is mountain-shaped for the first 12–18 months. One brand, one homepage, one app store listing.

> Positioning line: *"Meteo per la montagna, fatto bene."*

---

## 3. Competitive landscape

| Competitor | Strength | Weakness | Our angle |
|---|---|---|---|
| **ilMeteo.it** | SEO, brand, traffic | Generic, no vertical depth | We don't compete here |
| **Bergfex** (AT) | Dominant in Alps | Weak on Italian rifugi outside Dolomites | Italy-first, deeper route DB |
| **Windy.com** | Brilliant viz, free | Generic, no avalanche, no route context | AI briefings + route layer |
| **Mountain-Forecast** | Peak-by-peak | Dated UX, weak on Italy | Modern UX, Italian-native |
| **Meteomont app** | Official, free | Ugly, no UX innovation | Same data + better presentation + AI |
| **FATMAP / Komoot / AllTrails** | Route planning | Weather is afterthought | Weather-first planning |

**The gap we fill:** no one has built a polished, AI-native, Italy-first product combining (a) official AINEVA/Meteomont bulletins, (b) hyperlocal forecast on a specific route, (c) Gemini-generated Italian briefings, (d) structured Italian route database.

---

## 4. Product structure: Free vs Pro

**Both tiers serve the same user (the mountain person).** Free is not "generic weather" — that would dilute brand and attract wrong audience. Free is a great mountain product; Pro removes friction and unlocks depth.

### Free (ad-supported)
- Hyperlocal forecast for any point in Italy
- Browse full route database
- Today + 3-day forecast for any saved route
- Current AINEVA / Meteomont bulletin (official, with attribution)
- Webcams aggregator
- 1 AI briefing per day
- Ads

### Pro — €6.99/mo or €49/yr (with 14-day free trial)
- 7–10 day forecasts on routes
- Unlimited AI briefings + multi-route trip planning
- **AI trip planner** (see §6 — this is the killer feature)
- Push alerts: freezing-level changes, wind thresholds, precip transitions, new bulletin published for saved zones
- Aspect/slope-specific wind loading + snow accumulation
- Lightning forecast on exposed terrain
- Offline mode for refuges
- Historical conditions (was there fresh snow last weekend?)
- GPX export, share to WhatsApp
- Ad-free

**Pricing rationale:** mountain people pay €9.99/mo for Strava, €200 for an avalanche course, €250+ for a guided day. €4.99 underprices the value. Test €6.99/€49 first; easy to discount later, painful to raise.

### B2B tier (Phase 2)
- Rifugi (~3,500 in Italy), guide collegi, ski schools
- API + widget licensing: €20–100/month each

---

## 5. Tech architecture

### Data layer
- **Google Maps Weather API** — baseline current/hourly/daily forecasts. Easy on-ramp, $0.005–0.01/call.
- **ARPA regional bulletins** (Piemonte, Lombardia, Veneto, Trentino, FVG, Valle d'Aosta) — free, scrapable, higher-resolution local forecasts.
- **AINEVA + Meteomont** — official avalanche bulletins. Aggregate and present with attribution. Never publish our own danger ratings.
- **Google Earth Engine** — free DEM (elevation, slope, aspect) for terrain-specific computation per route.
- **Webcam aggregator** — free mountain webcams (rifugi, ski areas), cached periodically.
- **WeatherNext (GraphCast / GenCast)** — DeepMind models via BigQuery / Earth Engine. Only graduate to running these ourselves if accuracy beyond Maps API is needed (probably year 2+).

### Intelligence layer
- **Gemini 2.x via Vertex AI** (Flash for cost):
  - Multimodal briefings (webcam image + forecast + bulletin → natural Italian briefing)
  - Function calling for trip planner
  - Italian SEO content generation at scale for the long tail of "meteo + [comune/rifugio/cima]" queries
- Cost: ~€0.05–0.15/Pro user/month. Gross margin on AI layer ~95%.

### Backend
- **Cloud Run** for the API (autoscale, pay-per-request)
- **Cloud SQL or Firestore** for users, routes DB, cached briefings
- **Vector DB** (Vertex AI Vector Search or pgvector) for route similarity
- **Cloud Scheduler** to refresh forecasts/bulletins every 1–3h

### Frontend
- **Next.js webapp first** — SEO matters; "meteo rifugio Marmolada" is a real query. PWA for mobile.
- Native iOS/Android only after PLG validates.

### Vertical-agnostic backend, vertical-shaped frontend
Build forecast / terrain / briefing / alert services so adding cycling in 18 months = new frontend, same plumbing.

---

## 6. The killer feature: AI trip planner

**This is the single most important Pro feature.** None of our competitors do it well.

### Why it matters
A skilled mountaineer spends 1–2 hours planning a serious weekend (cross-referencing AINEVA, 3 weather models, refuge availability, party level, snow, sunrise, descent). Compress that to 5 minutes with a trustworthy result and we have a €100/yr product, not €40/yr.

### The trap to avoid
90% of "AI trip planners" are Gemini wrappers that hallucinate routes, invent refuges, misstate avalanche danger. **One hallucinated route on exposed terrain kills the brand.** Mountain people have tight community channels (CAI sections, FB groups, WhatsApp).

### Design principle
**AI for synthesis and language, never for facts.** Gemini decides what to *say*; structured data decides what's *true*.

### Flow
1. User intent (free text, Italian): *"Vorrei fare una gita scialpinistica in Dolomiti questo weekend, livello BSA, partenza da Cortina, durata mezza giornata"*
2. Gemini extracts structured params via function calling
3. **Backend (no AI)** does the work: filter route DB → fetch forecasts → fetch AINEVA bulletins → score and rank → apply hard safety filters
4. Top 3 candidates + real data passed to Gemini, which writes the plan in Italian *relazione* style: route description, timing (alba, partenza consigliata, vetta entro le 10), gear, AINEVA summary with official rating prominent, decision points, bail-out plan
5. Output = structured trip card. Saveable, shareable, modifiable ("e se invece partissi domenica?")

### Hard safety filters (Gemini cannot override)
- AINEVA = 4–5 on route's aspects → route removed from candidates
- Freezing level below valley altitude in summer → alpine routes filtered
- Avg wind > 60 km/h on exposed ridges → removed
- Gemini never sees filtered routes, so it can't suggest them

### Pro planner ladder
- Multi-day weekend planning
- 3 alternative options ranked by conditions
- "Plan B" if weather degrades
- Group planning ("siamo in 4, livello misto, uno alla prima esperienza")
- PDF/GPX export
- Post-trip GPX ingestion → personalization improves
- **"Avvisami se cambiano le condizioni"** — push if forecast or bulletin shifts after plan is generated. *This is the moment a free user becomes Pro forever.*

### Defensibility (in order)
1. **Route database quality.** Clean, structured Italian routes: GPS track, difficulty (UIAA/BSA/EE/EEA), exposure, aspect, ideal conditions, refuge dependencies, descent options, seasonal window, photos, recent reports. **6–12 months of grind.** This is the moat, not the AI.
2. **The safety filter layer** — what lets us sleep at night.
3. **Plan quality in Italian *relazione* format** — not generic prose. This is where Gemini earns its keep, but only because we feed it real data.

---

## 7. Liability & legal — non-negotiable

Avalanche forecasting in Italy is done by official agencies (AINEVA, Meteomont). **We never publish our own danger ratings.** We aggregate and present official bulletins with attribution; we add hyperlocal weather context the bulletins don't cover; we use AI to translate technical bulletins into plain-language route briefings.

Italian legal exposure is real ("cooperazione colposa nel reato colposo" has been applied to outdoor info providers).

### Required actions
- Lawyer review of T&Cs and disclaimer (budget €2–3k). **Pre-launch, not post.**
- Lawyer must be familiar with **CAI / Collegio Guide Alpine** framework around *"consiglio di gita."*
- T&Cs must establish: plans are decision *support* not recommendation; final responsibility = party leader; official bulletin always supersedes; gear choices are user's problem.
- Always show official AINEVA/Meteomont bulletin prominently with link to source.

---

## 8. Roadmap

### Months 0–3: Foundation
- Route DB MVP (start with Dolomiti + Lombardia + Piemonte). Sources: CAI guides, OSM, Gulliver, Skitourenguru, public scraping.
- Backend skeleton on GCP (Cloud Run + Cloud SQL + Maps Weather API)
- Gemini briefing prompt v1
- Lawyer engagement for T&Cs
- Landing page + waitlist

### Months 3–6: MVP launch
- Free webapp shipped: hyperlocal forecast + saved routes + AINEVA presentation + basic AI briefings
- Webcam integration
- Initial SEO push: long-tail "meteo + rifugio/cima" pages
- CAI section partnerships (start with 3–5 sections)
- Target: 5k registered users by month 6

### Months 6–9: Pro launch
- Trip planner shipped (with hard safety filters)
- Push alerts
- Pro tier live (€6.99/€49)
- Target: 1% conversion at 10k DAU = €40k ARR run rate by end month 9

### Months 9–12: Refinement + adjacencies
- Route DB expansion (full Alps + Appennino)
- Trail running, paragliding extensions
- Pro feature depth
- Target: 25k DAU, 2% conversion

### Year 2: B2B + cycling vertical
- API/widget for rifugi + guide collegi
- Cycling vertical launch on shared backend
- Target: €500k ARR

---

## 9. Costs / unit economics

### At 10k DAU (target end month 9)
- Maps Weather API: $1–3k/month (cache aggressively, share calls across users)
- Gemini (Flash + caching): €100–300/month
- GCP infra (Cloud Run, SQL, storage): ~$200/month
- **Total variable: <€5k/month**
- Lawyer (one-time pre-launch): €2–3k
- Optional: 1 part-time content/community person (CAI partnerships, SEO content): €1.5–2.5k/month

### Pro unit economics
- ARPU: €40–49/yr
- AI cost per Pro user: €0.60–1.80/yr
- Payment processing (~3%): €1.20–1.50/yr
- **Gross margin per Pro user: ~93–95%**

### Revenue model at scale
- 100k DAU × 2% Pro × €45 = **€90k ARR from Pro alone**
- + Ads on free tier (CPM €5–15 in Italy, niche audience commands premium): potentially €200–500k/yr at 100k DAU
- + B2B (rifugi, guide collegi): variable, potentially €100–300k/yr at maturity

ilMeteo at €13M is 100× this. Not the goal in year 1–2. The goal is profitable, defensible, beloved-by-users niche product. Year 3+ optionality on broader expansion.

---

## 10. Open questions / decisions needed

- [ ] **Brand name + domain.** Italian-feeling, mountain-feeling, .it and .com both available, app-store-friendly. Brainstorm separately.
- [ ] **CAI partnership strategy.** Approach nationally (rischio: slow) or 1-by-1 with sections (rischio: fragmented)?
- [ ] **First city/region for hyperlocal MVP.** Cortina + Madonna di Campiglio + Courmayeur for symbolic prestige? Or higher-volume areas like Bormio + Bergamasche?
- [ ] **iOS/Android timing.** Webapp PWA covers most use cases; native required for serious push notifications. Decide at month 6 based on usage data.
- [ ] **Founding team split.** Who owns product/design vs backend vs route DB curation vs community/CAI relations? Route DB is the moat — needs a dedicated owner, possibly a guide or experienced alpinist.
- [ ] **Funding.** Bootstrappable to €50k MRR with low burn. Decide if/when to raise. Italian VC limited; angel route via mountain-adjacent operators may be better.
- [ ] **Italian-only or EN from day one?** Italian-only is sharper positioning, faster execution. EN can come at Phase 2 for Alpine market expansion.

---

## 11. Things that will actually decide if this works

1. **Route DB quality and coverage.** This is the moat. Underinvest here = no defensibility.
2. **CAI / guide collegio credibility.** Distribution + legitimacy. Worth equity if needed.
3. **Trip planner doesn't hallucinate.** Hard safety filters + structured-data-first design.
4. **Italian-first cultural fit.** Real route names, *relazione* format, dialect awareness. Not a Google-translated foreign product.
5. **Speed of bulletin → push notification.** When AINEVA upgrades to 4 on Friday for a Saturday plan, we must alert within minutes.

---

## Changelog

- **2026-04-29** — Initial document. Captured market analysis (ilMeteo €13M), strategic decision (mountain-first niche, not generic weather), free vs Pro structure, AI trip planner as killer Pro feature, tech stack on GCP/Gemini, liability framework around AINEVA, roadmap, unit economics.
