"""
Postgres connection pool (psycopg 3). Only used when settings.database_url is set.

Cloud Run: point DATABASE_URL at the Cloud SQL unix socket or private IP;
pool sizing via DB_POOL_MAX (keep small — Cloud SQL connections are precious).
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    """Lazily created singleton pool (so importing the app offline never connects)."""
    global _pool
    if _pool is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is not set — DB store unavailable")
        _pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=settings.db_pool_max,
            kwargs={"autocommit": True},
            open=True,
        )
    return _pool


@contextmanager
def cursor() -> Iterator:
    """Dict-row cursor on a pooled connection."""
    with pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            yield cur


def close() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
