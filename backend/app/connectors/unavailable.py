"""
Placeholder connector for a country/service we have area+route data for but
have NOT yet built a real bulletin connector for (e.g. France before a
Météo-France/ANENA integration lands).

It never invents a danger rating: fetch() always raises BulletinFetchError,
which callers already treat as "unknown" — snow activities (scialpinismo,
alpinismo) fail-closed and get excluded, while non-snow activities
(escursionismo, via_ferrata, ...) proceed without a bulletin. This is the
same code path used for a real connector's network failures — "no connector
yet" and "connector down" both mean the same thing to a planner: unverifiable.
"""
from __future__ import annotations
from datetime import date
from typing import Optional
from .base import AvalancheConnector, BulletinFetchError
from ..models import Bulletin


class UnavailableConnector(AvalancheConnector):
    def __init__(self, service: str, country: str):
        self.service = service
        self.country = country

    def fetch(
        self, region: str, subzone: Optional[str] = None, on: Optional[date] = None
    ) -> Optional[Bulletin]:
        raise BulletinFetchError(
            f"Nessun connettore bollettino valanghe ancora integrato per "
            f"'{self.service}' ({self.country}) — copertura in arrivo."
        )
