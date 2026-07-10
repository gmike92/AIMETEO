# AIMETEO frontend (Next.js MVP)

App-router Next.js webapp consuming the backend. Italian, mountain-themed, demo-ready.

## Pages
- `/` — home + route browser (filter by activity), cards link to detail.
- `/routes/[slug]` — route detail: stats, on-route forecast, and a **Genera relazione di gita** button that calls the briefing service. Official AINEVA bulletin shown prominently with source link + decision-support disclaimer.
- `/planner` — trip planner: free-text intent → backend filters/scores/applies **hard safety filters** → shows safe candidates *and* the routes excluded for safety (with reasons). The AI never sees excluded routes.

## Run
```bash
# 1) start the backend first (see ../backend/README.md)
cd ../backend && uvicorn app.main:app --reload   # :8000

# 2) start the frontend
cd ../frontend
cp .env.local.example .env.local      # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm install
npm run dev                           # http://localhost:3000
```

## Notes / next steps
- Client-side fetching for the MVP. For SEO (the plan calls for it), migrate the route
  list + detail to **server components** that fetch at request time, and add per-route
  metadata + long-tail "meteo + [rifugio/cima]" pages.
- Forecast currently uses demo coordinates per route; wire `start_point` lat/lon once the
  route store returns geometry from PostGIS.
- Auth, saved routes, push alerts, and the Pro paywall are post-MVP.
- API base is env-driven, so pointing at the deployed Cloud Run URL is a one-line change.
