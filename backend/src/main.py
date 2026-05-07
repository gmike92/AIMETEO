"""
AIMETEO — Backend API (v2.0)
FastAPI app aggiornata con pipeline ETL reale.

Endpoints:
  GET /api/status           — stato backend + cache stats
  GET /api/forecast         — previsione meteo iperlocale (Google Maps / Open-Meteo)
  GET /api/bulletin/{region} — bollettino valanghe AINEVA/EAWS
  GET /api/bulletins/italy  — tutti i bollettini italiani
  POST /api/cache/flush     — svuota la cache (dev/ops)

Variabili d'ambiente:
  GOOGLE_MAPS_WEATHER_API_KEY  — sorgente primaria meteo
  WEATHER_SOURCE               — "google" | "open_meteo" | "auto" (default: auto)
  SCRAPER_TIMEOUT_SEC          — timeout scraper (default: 15)
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import logging
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from etl.weather_pipeline import get_forecast
from etl.aineva_scraper import get_bulletin, get_all_italian_bulletins
from cache import cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AIMETEO Backend",
    description="AI-native mountain weather API — Italy first",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# STATUS
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    weather_source = os.getenv("WEATHER_SOURCE", "auto")
    has_google_key = bool(os.getenv("GOOGLE_MAPS_WEATHER_API_KEY"))
    return {
        "status": "online",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "weather_source": weather_source,
        "google_api_key_configured": has_google_key,
        "active_source": "google_maps_weather" if has_google_key else "open_meteo_ecmwf",
        "cache": cache.stats(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# FORECAST — sostituisce il vecchio endpoint mock
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/forecast")
async def forecast_endpoint(
    lat: float = Query(..., ge=-90, le=90, description="Latitudine"),
    lon: float = Query(..., ge=-180, le=180, description="Longitudine"),
):
    """
    Previsione meteo iperlocale per coordinate (lat, lon).
    Ritorna griglia 5×5 (1km×1km), dati orari 7 giorni, aggregato giornaliero.
    Cache TTL: 60 minuti.
    """
    try:
        forecast = await get_forecast(lat, lon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception(f"Errore inaspettato in /api/forecast: {e}")
        raise HTTPException(status_code=500, detail="Errore interno del server")

    # Risposta compatibile con il frontend esistente (campo grid + nuovi campi hourly/daily)
    return {
        "status": "success",
        "timestamp": forecast.timestamp.isoformat(),
        "source": forecast.source,
        "center_coords": forecast.center_coords,
        "model_resolution": forecast.model_resolution,
        "grid": [cell.model_dump() for cell in forecast.grid],
        "hourly": [h.model_dump(mode="json") for h in forecast.hourly[:48]],   # 48h
        "daily": [d.model_dump(mode="json") for d in forecast.daily],
    }


# ──────────────────────────────────────────────────────────────────────────────
# BOLLETTINI VALANGHE
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/bulletin/{region_id}")
async def bulletin_endpoint(region_id: str):
    """
    Bollettino valanghe AINEVA/EAWS per una regione italiana.
    Codici regione: IT-32-BZ, IT-32-TN, IT-34, IT-23, IT-25, IT-21, IT-36
    Cache TTL: 2 ore.
    """
    bulletin = await get_bulletin(region_id)
    if bulletin is None:
        raise HTTPException(
            status_code=404,
            detail=f"Bollettino non disponibile per la regione '{region_id}'. "
                   f"Verifica il codice EAWS su https://www.eaws.eu/en/mountain-regions/"
        )
    return bulletin.model_dump(mode="json")


@app.get("/api/bulletins/italy")
async def all_bulletins_endpoint():
    """
    Tutti i bollettini valanghe italiani disponibili.
    Utile per la mappa overview e le alert di sicurezza nazionali.
    """
    bulletins = await get_all_italian_bulletins()
    return {
        "status": "success",
        "timestamp": datetime.utcnow().isoformat(),
        "count": len(bulletins),
        "bulletins": [b.model_dump(mode="json") for b in bulletins],
        "critical_regions": [
            b.region_name for b in bulletins if b.has_critical_danger
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# CACHE MANAGEMENT (dev/ops)
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/cache/flush")
async def flush_cache():
    """Svuota tutta la cache. Usare con cautela in produzione."""
    cache.flush()
    return {"status": "flushed", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/cache/stats")
async def cache_stats():
    return cache.stats()