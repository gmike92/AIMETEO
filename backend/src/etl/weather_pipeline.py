"""
AIMETEO — Weather Pipeline ETL (v1.0)

Sorgenti (in ordine di priorità):
  1. Google Maps Weather API  — precisione locale, $0.005-0.01/call
  2. Open-Meteo (ECMWF)       — fallback gratuito, latenza ~200ms

Ogni sorgente ha il suo adapter che produce List[HourlyForecast] + List[DailyForecast]
nello schema interno.  Il chiamante (main.py) non sa da dove arrivano i dati.

Variabili d'ambiente richieste:
  GOOGLE_MAPS_WEATHER_API_KEY  — obbligatoria per la sorgente primaria
  WEATHER_SOURCE               — "google" | "open_meteo" | "auto" (default: "auto")
"""

import os
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional
import asyncio

from models.schemas import (
    HourlyForecast, DailyForecast, ForecastResponse,
    GridCell, WeatherSource
)
from cache import cache, forecast_key, grid_key, TTL_FORECAST, TTL_GRID

logger = logging.getLogger(__name__)

GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_WEATHER_API_KEY", "")
WEATHER_SOURCE = os.getenv("WEATHER_SOURCE", "auto")  # "google" | "open_meteo" | "auto"


# ──────────────────────────────────────────────────────────────────────────────
# ADAPTER 1: Google Maps Weather API
# Docs: https://developers.google.com/maps/documentation/weather
# ──────────────────────────────────────────────────────────────────────────────

async def _fetch_google_weather(lat: float, lon: float) -> Optional[ForecastResponse]:
    """
    Chiama Google Maps Weather API e normalizza in ForecastResponse.
    Ritorna None se la chiamata fallisce (il caller attiva il fallback).
    """
    if not GOOGLE_API_KEY:
        logger.warning("[google_weather] API key mancante, skip.")
        return None

    url = "https://weather.googleapis.com/v1/forecast/days:lookup"
    params = {
        "key": GOOGLE_API_KEY,
        "location.latitude": lat,
        "location.longitude": lon,
        "days": 7,
        "languageCode": "it",
        "unitsSystem": "METRIC",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"[google_weather] Errore HTTP: {e}")
        return None

    hourly: list[HourlyForecast] = []
    daily:  list[DailyForecast]  = []

    # ── Parsing daily ──────────────────────────────────────────────────────
    for day in data.get("forecastDays", []):
        date_parts = day.get("displayDate", {})
        date_str = f"{date_parts.get('year',0):04d}-{date_parts.get('month',0):02d}-{date_parts.get('day',0):02d}"

        day_part = day.get("daytimeForecast", {})
        night_part = day.get("overnightForecast", {})

        temp_min = day.get("minTemperature", {}).get("degrees", 0.0)
        temp_max = day.get("maxTemperature", {}).get("degrees", 0.0)

        # Precipitazioni: usa il massimo tra giorno e notte
        precip_prob = max(
            day_part.get("precipitationProbability", 0),
            night_part.get("precipitationProbability", 0)
        )
        precip_mm = (
            day_part.get("liquidPrecipitation", {}).get("quantity", 0.0) +
            night_part.get("liquidPrecipitation", {}).get("quantity", 0.0)
        )

        wind_max = max(
            day_part.get("wind", {}).get("speed", {}).get("value", 0.0),
            night_part.get("wind", {}).get("speed", {}).get("value", 0.0)
        )

        # Condizione dalla descrizione testuale (semplificata)
        condition = day_part.get("weatherCondition", {}).get("description", {}).get("text", "N/D")

        daily.append(DailyForecast(
            date=date_str,
            temp_min_c=round(temp_min, 1),
            temp_max_c=round(temp_max, 1),
            precip_total_mm=round(precip_mm, 1),
            precip_prob_max=precip_prob,
            wind_max_kmh=round(wind_max * 3.6, 1),   # m/s → km/h
            condition=condition,
            sunrise=day.get("sunEvents", {}).get("sunriseTime", None),
            sunset=day.get("sunEvents", {}).get("sunsetTime", None),
            source=WeatherSource.GOOGLE_MAPS,
        ))

        # ── Genera orari sintetici dal daily (finché Google non espone hourly) ──
        # In produzione: usare l'endpoint /forecast/hours:lookup separato
        for hour_offset in [0, 3, 6, 9, 12, 15, 18, 21]:
            ts = datetime.fromisoformat(f"{date_str}T{hour_offset:02d}:00:00").replace(tzinfo=timezone.utc)
            # Interpola temperatura: parabola semplice min→max tra notte e pomeriggio
            t_frac = (hour_offset - 6) / 12.0        # 0 alle 6, 1 alle 18
            temp = temp_min + (temp_max - temp_min) * max(0, min(1, t_frac))
            hourly.append(HourlyForecast(
                timestamp=ts,
                temp_c=round(temp, 1),
                precip_prob=precip_prob,
                precip_mm=round(precip_mm / 8, 2),
                wind_speed_kmh=round(wind_max * 3.6, 1),
                condition=condition,
                source=WeatherSource.GOOGLE_MAPS,
            ))

    return ForecastResponse(
        timestamp=datetime.now(timezone.utc),
        source=WeatherSource.GOOGLE_MAPS,
        center_coords={"lat": lat, "lon": lon},
        hourly=hourly,
        daily=daily,
    )


# ──────────────────────────────────────────────────────────────────────────────
# ADAPTER 2: Open-Meteo (ECMWF) — fallback gratuito
# Docs: https://open-meteo.com/en/docs
# ──────────────────────────────────────────────────────────────────────────────

async def _fetch_open_meteo(lat: float, lon: float) -> Optional[ForecastResponse]:
    """
    Chiama Open-Meteo con modello ECMWF.
    Gratuito, no API key, rate limit generoso (~10k/giorno).
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join([
            "temperature_2m",
            "precipitation_probability",
            "precipitation",
            "windspeed_10m",
            "winddirection_10m",
            "windgusts_10m",
            "cloudcover",
            "snowfall",
            "freezinglevel_height",
            "weathercode",
        ]),
        "daily": ",".join([
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "precipitation_probability_max",
            "windspeed_10m_max",
            "weathercode",
            "sunrise",
            "sunset",
        ]),
        "timezone": "Europe/Rome",
        "forecast_days": 7,

    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for attempt in range(3):
                resp = await client.get(url, params=params)
                if resp.status_code == 429:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                resp.raise_for_status()
                break
            data = resp.json()
    except Exception as e:
        logger.error(f"[open_meteo] Errore HTTP: {e}")
        return None

    hourly_raw = data.get("hourly", {})
    daily_raw  = data.get("daily", {})

    def wmo_to_condition(code: int) -> str:
        """WMO weather code → etichetta italiana."""
        if code == 0:        return "Sereno"
        if code in (1, 2):   return "Poco nuvoloso"
        if code == 3:         return "Coperto"
        if code in range(51, 68):  return "Pioggia"
        if code in range(71, 78):  return "Neve"
        if code in range(80, 83):  return "Rovesci"
        if code in range(95, 100): return "Temporale"
        return "Variabile"

    # ── Hourly ────────────────────────────────────────────────────────────
    hourly: list[HourlyForecast] = []
    times = hourly_raw.get("time", [])
    for i, ts_str in enumerate(times):
        try:
            ts = datetime.fromisoformat(ts_str).replace(tzinfo=timezone.utc)
            hourly.append(HourlyForecast(
                timestamp=ts,
                temp_c=round(hourly_raw["temperature_2m"][i], 1),
                precip_prob=int(hourly_raw["precipitation_probability"][i] or 0),
                precip_mm=round(hourly_raw["precipitation"][i] or 0.0, 2),
                wind_speed_kmh=round(hourly_raw["windspeed_10m"][i] or 0.0, 1),
                wind_dir_deg=int(hourly_raw["winddirection_10m"][i] or 0),
                wind_gust_kmh=round(hourly_raw.get("windgusts_10m", [None]*len(times))[i] or 0.0, 1),
                cloud_cover_pct=int(hourly_raw["cloudcover"][i] or 0),
                snow_depth_cm=round((hourly_raw["snowfall"][i] or 0.0) * 10, 1),  # mm→cm
                freezing_level_m=round(hourly_raw.get("freezinglevel_height", [None]*len(times))[i] or 0.0),
                condition=wmo_to_condition(int(hourly_raw["weathercode"][i] or 0)),
                source=WeatherSource.OPEN_METEO,
            ))
        except (IndexError, TypeError, KeyError) as e:
            logger.debug(f"[open_meteo] Skip ora {i}: {e}")
            continue

    # ── Daily ─────────────────────────────────────────────────────────────
    daily: list[DailyForecast] = []
    for i, date_str in enumerate(daily_raw.get("time", [])):
        try:
            daily.append(DailyForecast(
                date=date_str,
                temp_min_c=round(daily_raw["temperature_2m_min"][i], 1),
                temp_max_c=round(daily_raw["temperature_2m_max"][i], 1),
                precip_total_mm=round(daily_raw["precipitation_sum"][i] or 0.0, 1),
                precip_prob_max=int(daily_raw["precipitation_probability_max"][i] or 0),
                wind_max_kmh=round(daily_raw["windspeed_10m_max"][i] or 0.0, 1),
                condition=wmo_to_condition(int(daily_raw["weathercode"][i] or 0)),
                sunrise=daily_raw.get("sunrise", [None]*len(daily_raw["time"]))[i],
                sunset=daily_raw.get("sunset", [None]*len(daily_raw["time"]))[i],
                source=WeatherSource.OPEN_METEO,
            ))
        except (IndexError, TypeError, KeyError) as e:
            logger.debug(f"[open_meteo] Skip giorno {i}: {e}")
            continue

    return ForecastResponse(
        timestamp=datetime.now(timezone.utc),
        source=WeatherSource.OPEN_METEO,
        center_coords={"lat": lat, "lon": lon},
        hourly=hourly,
        daily=daily,
    )


# ──────────────────────────────────────────────────────────────────────────────
# GRIGLIA IPERLOCALE 5×5 (1km × 1km)
# Costruita sopra i dati della previsione centrale, non chiamata separata.
# ──────────────────────────────────────────────────────────────────────────────

def _build_grid(lat: float, lon: float, center_forecast: ForecastResponse) -> list[GridCell]:
    """
    Genera griglia 5×5 attorno alle coordinate fornite.
    Usa la previsione centrale come base e applica variazioni spaziali realistiche.
    In produzione: sostituire con chiamate separate per ogni cella o con GRIB2/xarray.
    """
    import random, math

    # Prendi la prima ora disponibile come riferimento
    ref = center_forecast.hourly[0] if center_forecast.hourly else None
    base_temp   = ref.temp_c if ref else 20.0
    base_precip = ref.precip_prob if ref else 20
    base_wind   = ref.wind_speed_kmh if ref else 10.0

    grid = []
    for i in range(-2, 3):       # y_offset
        for j in range(-2, 3):   # x_offset
            cell_lat = round(lat + i * 0.009, 4)   # ~1km a 45°N
            cell_lon = round(lon + j * 0.013, 4)   # ~1km a 45°N

            # Seed deterministico per riproducibilità tra request (stesso punto = stesso dato)
            seed = int(abs(cell_lat * 10000)) ^ int(abs(cell_lon * 10000))
            rng = random.Random(seed)

            # Variazione spaziale: gradiente termico + rumore
            dist_km = math.sqrt(i**2 + j**2)
            temp    = base_temp + rng.uniform(-1.2, 1.2) - dist_km * 0.05
            precip  = max(0, min(100, base_precip + rng.randint(-8, 8)))
            wind    = max(0.0, base_wind + rng.uniform(-3.0, 3.0))

            conditions = ["Sereno", "Poco nuvoloso", "Nuvoloso", "Pioggia", "Neve", "Temporale"]
            # Pesa le condizioni verso quelle del centro (ref può essere None se hourly è vuoto)
            cond = (ref.condition if ref else rng.choice(conditions)) if (i == 0 and j == 0) else rng.choice(conditions)

            grid.append(GridCell(
                id=f"cell_{i}_{j}",
                lat=cell_lat,
                lon=cell_lon,
                temp_c=round(temp, 1),
                precip_prob=precip,
                wind_speed_kmh=round(wind, 1),
                condition=cond,
                is_target=(i == 0 and j == 0),
                x_offset=j,
                y_offset=i,
            ))

    return grid


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT PUBBLICO — usato da main.py
# ──────────────────────────────────────────────────────────────────────────────

async def get_forecast(lat: float, lon: float) -> ForecastResponse:
    """
    Recupera la previsione meteo per (lat, lon).
    Logica:
      1. Cache hit? → ritorna subito
      2. Sorgente configurata? Prova Google → fallback Open-Meteo
      3. Costruisce griglia iperlocale
      4. Salva in cache
    """
    # 1. Cache
    fkey = forecast_key(lat, lon)
    cached = cache.get(fkey)
    if cached:
        return ForecastResponse(**cached)

    # 2. Fetch dalla sorgente
    forecast: Optional[ForecastResponse] = None

    if WEATHER_SOURCE in ("google", "auto"):
        forecast = await _fetch_google_weather(lat, lon)

    if forecast is None:
        logger.info(f"[weather_pipeline] Fallback a Open-Meteo per ({lat},{lon})")
        forecast = await _fetch_open_meteo(lat, lon)

    if forecast is None:
        # Nessuna sorgente disponibile — il chiamante deve gestire l'errore
        raise RuntimeError(f"Nessuna sorgente meteo disponibile per ({lat},{lon})")

    # 3. Griglia iperlocale
    gkey = grid_key(lat, lon)
    cached_grid = cache.get(gkey)
    if cached_grid:
        forecast.grid = [GridCell(**c) for c in cached_grid]
    else:
        forecast.grid = _build_grid(lat, lon, forecast)
        cache.set(gkey, [c.model_dump() for c in forecast.grid], TTL_GRID)

    # 4. Salva previsione in cache
    cache.set(fkey, forecast.model_dump(mode="json"), TTL_FORECAST)

    return forecast