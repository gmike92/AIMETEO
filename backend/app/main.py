"""
AIMETEO backend — Cloud Run entrypoint.

Vertical-agnostic services: forecast · terrain · briefing · alert (+ planner).
Country-agnostic via pluggable avalanche connectors. Run:
    uvicorn app.main:app --reload
"""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .connectors import registry
from .services import forecast, terrain, briefing, alert, planner, routes, waitlist, conditions, gpx_export, route_weather
from . import store

app = FastAPI(
    title="AIMETEO backend",
    version="0.1.0",
    description="Mountain weather + safety engine. AI for language, structured data for facts.",
)

# CORS — allow the Next.js frontend (and local dev) to call the API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,  # local: *, prod: CORS_ORIGINS env (csv)
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(gpx_export.router)  # before routes: /routes/{slug}/gpx
app.include_router(route_weather.router)  # /routes/{slug}/weather
app.include_router(routes.router)
app.include_router(forecast.router)
app.include_router(terrain.router)
app.include_router(briefing.router)
app.include_router(alert.router)
app.include_router(planner.router)
app.include_router(waitlist.router)
app.include_router(conditions.router)


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return {
        "status": "ok",
        "env": settings.env,
        "mock_data": settings.use_mock_data,
        "route_store": store.BACKEND,
        "default_country": settings.default_country,
        "avalanche_services": registry.registered_services(),
    }


@app.get("/", tags=["meta"])
def root() -> dict:
    return {
        "service": "aimeteo-backend",
        "services": ["forecast", "terrain", "briefing", "alert", "planner"],
        "docs": "/docs",
    }
