"""Runtime configuration. Values come from env (Cloud Run) with safe local defaults."""
from __future__ import annotations
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    env: str = os.getenv("APP_ENV", "local")            # local | staging | prod
    gcp_project: str = os.getenv("GCP_PROJECT", "")
    region: str = os.getenv("GCP_REGION", "europe-west1")

    # External data providers (keys injected via Secret Manager in prod)
    maps_weather_api_key: str = os.getenv("MAPS_WEATHER_API_KEY", "")
    weather_api_base: str = os.getenv(
        "WEATHER_API_BASE", "https://weather.googleapis.com/v1"
    )
    forecast_cache_ttl_min: int = int(os.getenv("FORECAST_CACHE_TTL_MIN", "30"))
    vertex_model: str = os.getenv("VERTEX_MODEL", "gemini-2.0-flash")
    # Vertex AI region can differ from the app region (model availability).
    vertex_location: str = os.getenv("VERTEX_LOCATION", os.getenv("GCP_REGION", "europe-west1"))
    # Earth Engine DEM asset for slope/aspect sampling.
    ee_dem_asset: str = os.getenv("EE_DEM_ASSET", "COPERNICUS/DEM/GLO30")
    # Shared secret required by /alert/run when set (Cloud Scheduler header).
    scheduler_token: str = os.getenv("SCHEDULER_TOKEN", "")

    # Route store. Empty → in-memory seed store (offline dev).
    # Set to a Postgres DSN (Cloud SQL / local) to use the real database, e.g.
    #   postgresql://user:pass@host:5432/aimeteo   (Cloud Run: unix socket DSN)
    database_url: str = os.getenv("DATABASE_URL", "")
    db_pool_max: int = int(os.getenv("DB_POOL_MAX", "4"))

    # Feature flags
    use_mock_data: bool = os.getenv("USE_MOCK_DATA", "true").lower() == "true"
    trip_planner_enabled: bool = os.getenv("TRIP_PLANNER_ENABLED", "true").lower() == "true"

    # Default market at launch (expansion adds more)
    default_country: str = os.getenv("DEFAULT_COUNTRY", "IT")
    default_locale: str = os.getenv("DEFAULT_LOCALE", "it")

    # CORS: comma-separated allowed origins for non-local envs (the deployed frontend).
    # Local dev allows all. Empty in prod = no browser origin allowed (so SET this).
    cors_origins: str = os.getenv("CORS_ORIGINS", "")

    @property
    def cors_allow_origins(self) -> list[str]:
        if self.env == "local":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
