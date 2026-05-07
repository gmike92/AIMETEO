"""
AIMETEO — Pydantic Schemas (v1.0)
Schema unificato interno per dati meteo e bollettini valanghe.
Tutte le sorgenti (Google Maps Weather, Open-Meteo, AINEVA, ARPA) vengono
normalizzate in questi modelli prima di qualsiasi elaborazione downstream.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import IntEnum


# ──────────────────────────────────────────────────────────────────────────────
# METEO
# ──────────────────────────────────────────────────────────────────────────────

class WeatherSource(str):
    GOOGLE_MAPS = "google_maps_weather"
    OPEN_METEO  = "open_meteo"
    MOCK        = "mock"


class HourlyForecast(BaseModel):
    """Previsione per una singola ora, sorgente-agnostica."""
    timestamp: datetime
    temp_c: float                              # temperatura aria a 2m (°C)
    feels_like_c: Optional[float] = None
    precip_prob: int = Field(ge=0, le=100)     # probabilità precipitazione (%)
    precip_mm: float = 0.0                     # precipitazione attesa (mm)
    wind_speed_kmh: float                      # velocità vento (km/h)
    wind_dir_deg: Optional[int] = None         # direzione vento (°)
    wind_gust_kmh: Optional[float] = None
    cloud_cover_pct: Optional[int] = None      # copertura nuvolosa (%)
    snow_depth_cm: Optional[float] = None      # manto nevoso (cm, solo alta quota)
    freezing_level_m: Optional[float] = None   # quota zero termico (m slm)
    condition: str = "Unknown"                 # etichetta human-readable
    source: str = WeatherSource.MOCK


class DailyForecast(BaseModel):
    """Aggregato giornaliero (min/max/totali)."""
    date: str                                  # formato YYYY-MM-DD
    temp_min_c: float
    temp_max_c: float
    precip_total_mm: float = 0.0
    precip_prob_max: int = Field(ge=0, le=100)
    wind_max_kmh: float
    condition: str = "Unknown"
    sunrise: Optional[str] = None             # HH:MM locale
    sunset: Optional[str] = None
    source: str = WeatherSource.MOCK


class GridCell(BaseModel):
    """Cella della griglia iperlocale 1km×1km (usata dal frontend)."""
    id: str
    lat: float
    lon: float
    temp_c: float
    precip_prob: int
    wind_speed_kmh: float
    condition: str
    is_target: bool = False
    x_offset: int = 0
    y_offset: int = 0


class ForecastResponse(BaseModel):
    """Risposta completa dell'endpoint /api/forecast."""
    status: str = "success"
    timestamp: datetime
    source: str
    center_coords: dict                        # {"lat": ..., "lon": ...}
    model_resolution: str = "1km x 1km"
    hourly: List[HourlyForecast] = []
    daily: List[DailyForecast] = []
    grid: List[GridCell] = []


# ──────────────────────────────────────────────────────────────────────────────
# BOLLETTINI VALANGHE
# ──────────────────────────────────────────────────────────────────────────────

class AvalancheDanger(IntEnum):
    """
    Scala europea pericolo valanghe (1–5).
    https://www.aineva.it/bollettino/scala-pericolo/
    """
    LOW        = 1   # Debole
    LIMITED    = 2   # Limitato
    MARKED     = 3   # Marcato
    HIGH       = 4   # Forte
    VERY_HIGH  = 5   # Molto forte


class AspectExposure(str):
    """Esposizioni cardinali e inter-cardinali."""
    N = "N"; NE = "NE"; E = "E"; SE = "SE"
    S = "S"; SW = "SW"; W = "W"; NW = "NW"
    ALL = "ALL"


class AvalancheProblem(BaseModel):
    """Singolo problema valanghivo (es. lastroni sopravento)."""
    problem_type: str                          # lastroni, neve fresca, umida, etc.
    aspects: List[str] = []                    # esposizioni interessate
    elevation_min_m: Optional[int] = None
    elevation_max_m: Optional[int] = None
    danger_rating: AvalancheDanger


class AvalancheBulletin(BaseModel):
    """
    Bollettino valanghe normalizzato da qualsiasi sorgente
    (AINEVA, Meteomont, ARPA regionali).
    """
    region_id: str                             # es. "IT-32-BZ" (codice EAWS)
    region_name: str                           # es. "Alto Adige"
    published_at: datetime
    valid_from: datetime
    valid_until: datetime

    # Pericolo principale (quota bassa / quota alta se differenziato)
    danger_rating_lo: AvalancheDanger          # < 2000m tipicamente
    danger_rating_hi: AvalancheDanger          # > 2000m tipicamente

    # Problema valanghivo principale (può essere assente a pericolo 1)
    problems: List[AvalancheProblem] = []

    # Testo ufficiale (italiano)
    tendency_text: Optional[str] = None        # es. "Pericolo stabile nei prossimi giorni"
    snowpack_text: Optional[str] = None        # descrizione manto nevoso
    weather_text: Optional[str] = None         # condizioni meteo associate

    source_url: str = ""
    source_name: str = ""                      # "AINEVA" | "Meteomont" | "ARPA Piemonte" …

    # Flag calcolato dal Safety Engine (non dalla sorgente)
    has_critical_danger: bool = False          # True se danger_hi >= 4


# ──────────────────────────────────────────────────────────────────────────────
# CACHE ENTRY (usato da cache.py)
# ──────────────────────────────────────────────────────────────────────────────

class CacheEntry(BaseModel):
    key: str
    data: dict
    cached_at: datetime
    ttl_seconds: int = 3600