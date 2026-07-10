"""
Route store facade.

DATABASE_URL set   → Postgres (Cloud SQL / local), queries against route-db/schema.sql.
DATABASE_URL empty → in-memory seed store (offline dev, USE_MOCK_DATA workflows).

Services import this module only; both backends return identical dict shapes.
"""
from __future__ import annotations

from .config import settings

if settings.database_url:
    from . import store_pg as _impl
else:
    from . import store_memory as _impl

BACKEND: str = "postgres" if settings.database_url else "memory"

list_areas = _impl.list_areas
list_routes = _impl.list_routes
get_route = _impl.get_route
area_for_route = _impl.area_for_route
