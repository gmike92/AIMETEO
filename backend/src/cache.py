"""
AIMETEO — Cache Layer (v1.0)

Cache in-memory con TTL, progettata per essere drop-in sostituita con Redis
(GCP Memorystore) in produzione senza modificare i chiamanti.

Strategia TTL:
  - Previsioni meteo:   60 min  (aggiornamento pipeline ETL)
  - Bollettini AINEVA:  120 min (i bollettini cambiano 1-2x al giorno)
  - Griglia iperlocale: 30 min  (più fresca, ma costosa da calcolare)
"""

import time
import logging
from typing import Any, Optional
from threading import Lock

logger = logging.getLogger(__name__)


class InMemoryCache:
    """
    Cache thread-safe in-memory con TTL per chiave.
    Interfaccia identica a quella che useremmo con redis-py:
        cache.set(key, value, ttl)
        cache.get(key)  → None se scaduta o assente
        cache.delete(key)
        cache.flush()
    """

    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}  # key → (value, expires_at)
        self._lock = Lock()

    def set(self, key: str, value: Any, ttl: int = 3600) -> None:
        """Salva un valore con TTL in secondi."""
        expires_at = time.time() + ttl
        with self._lock:
            self._store[key] = (value, expires_at)
        logger.debug(f"[cache] SET {key} (TTL {ttl}s)")

    def get(self, key: str) -> Optional[Any]:
        """Restituisce il valore se presente e non scaduto, altrimenti None."""
        with self._lock:
            entry = self._store.get(key)
        if entry is None:
            logger.debug(f"[cache] MISS {key}")
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            logger.debug(f"[cache] EXPIRED {key}")
            with self._lock:
                self._store.pop(key, None)
            return None
        logger.debug(f"[cache] HIT {key}")
        return value

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def flush(self) -> None:
        """Svuota tutta la cache (utile in test o per forzare refresh)."""
        with self._lock:
            self._store.clear()
        logger.info("[cache] FLUSHED")

    def stats(self) -> dict:
        """Ritorna statistiche sulla cache (utile per /api/debug)."""
        now = time.time()
        with self._lock:
            total = len(self._store)
            alive = sum(1 for _, exp in self._store.values() if exp > now)
        return {"total_keys": total, "alive_keys": alive, "expired_keys": total - alive}


# ──────────────────────────────────────────────────────────────────────────────
# Singleton — un'unica istanza condivisa da tutta l'app FastAPI
# ──────────────────────────────────────────────────────────────────────────────

cache = InMemoryCache()

# TTL constants (secondi) — facili da modificare in un posto solo
TTL_FORECAST  = 60 * 60        # 1 ora
TTL_BULLETIN  = 60 * 120       # 2 ore
TTL_GRID      = 60 * 30        # 30 minuti


def forecast_key(lat: float, lon: float) -> str:
    """Chiave cache per una previsione: arrotonda a ~1km per massimizzare gli hit."""
    return f"forecast:{round(lat, 2)}:{round(lon, 2)}"


def bulletin_key(region_id: str) -> str:
    return f"bulletin:{region_id}"


def grid_key(lat: float, lon: float) -> str:
    return f"grid:{round(lat, 2)}:{round(lon, 2)}"