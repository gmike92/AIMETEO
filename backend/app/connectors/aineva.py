"""
AINEVA connector (Italy) — REAL.

Source: official EAWS/AINEVA bulletins published as CAAML v6 JSON on the avalanche.report
static mirror, one file per macro-region per day:

    https://static.avalanche.report/eaws_bulletins/{YYYY-MM-DD}/{YYYY-MM-DD}-{REGION}.json

Region file ids (verified): IT-25 (Lombardia), IT-23 (Valle d'Aosta), IT-32-BZ (Alto Adige),
IT-32-TN (Trentino), IT-34 (Veneto), IT-21 (Piemonte), IT-36 (FVG). Each file holds several
bulletins, each covering a list of micro-regions (regionID). We pick the bulletin matching
the route's micro-region; if unknown, we take the most dangerous in the file (conservative).

Parsing/normalization lives in caaml.py. We never author danger ratings.

USE_MOCK_DATA=true returns a deterministic mock (offline dev / off-season).
"""
from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx

from .base import AvalancheConnector, BulletinFetchError
from .caaml import parse_caaml
from ..models import Bulletin
from ..config import settings

STATIC_BASE = "https://static.avalanche.report/eaws_bulletins"


class AinevaConnector(AvalancheConnector):
    service = "AINEVA"
    country = "IT"

    def _url(self, region: str, on: date) -> str:
        d = on.isoformat()
        return f"{STATIC_BASE}/{d}/{d}-{region}.json"

    def _get(self, url: str) -> httpx.Response:
        try:
            return httpx.get(url, timeout=10.0, headers={"Accept": "application/json"})
        except httpx.HTTPError as e:
            raise BulletinFetchError(f"AINEVA fetch failed for {url}: {e}") from e

    def fetch(
        self,
        region: str,
        subzone: Optional[str] = None,
        on: Optional[date] = None,
    ) -> Optional[Bulletin]:
        """
        None = no bulletin in force (off-season / expired) — a verified fact.
        BulletinFetchError = could not verify — callers must fail closed.
        """
        if settings.use_mock_data:
            return self._mock(region, subzone)

        on = on or date.today()
        url = self._url(region, on)
        resp = self._get(url)
        if resp.status_code == 404:
            # No file for today (bulletins are published ~17:00 for the next day) —
            # try the previous day's file once. `url` MUST track the file actually
            # used: it becomes the Bulletin's official source link (liability).
            url = self._url(region, on - timedelta(days=1))
            resp = self._get(url)
            if resp.status_code == 404:
                return None  # genuinely no bulletin published (off-season)
        if resp.status_code != 200:
            raise BulletinFetchError(f"AINEVA mirror returned {resp.status_code} for {url}")

        try:
            data = resp.json()
        except ValueError as e:
            raise BulletinFetchError(f"AINEVA payload is not valid JSON at {url}: {e}") from e

        bulletin = parse_caaml(
            data, region=region, subzone=subzone, source_url=url,
            country=self.country, service=self.service,
        )
        # An expired bulletin is NOT in force — equivalent to no bulletin (the
        # planner fails closed in snow season), never served as current. Expiry is
        # relative to the requested date: live calls use the clock; historical
        # fetches accept a bulletin valid at any point of the requested day.
        if bulletin is not None and bulletin.valid_until is not None:
            valid_until = bulletin.valid_until
            if valid_until.tzinfo is None:
                valid_until = valid_until.replace(tzinfo=timezone.utc)
            if on == date.today():
                ref = datetime.now(timezone.utc)
            else:
                ref = datetime(on.year, on.month, on.day, tzinfo=timezone.utc)
            if valid_until < ref:
                return None
        return bulletin

    #: Months with NO bulletin in force (real AINEVA season is ~Nov-May).
    OFF_SEASON_MONTHS = {6, 7, 8, 9, 10}

    def _mock(self, region: str, subzone: Optional[str]) -> Optional[Bulletin]:
        now = self._now()
        # Season-aware demo: out of season the mock behaves like the real
        # service (no bulletin in force) so the UI shows the true state.
        if now.month in self.OFF_SEASON_MONTHS:
            return None
        return Bulletin(
            avalanche_service=self.service,
            avalanche_zone=subzone or region,
            country=self.country,
            issued_at=now,
            valid_until=now + timedelta(hours=24),
            danger_level=3,
            danger_by_aspect={"N": 3, "NE": 3, "E": 2, "SE": 2, "S": 1, "SW": 1, "W": 2, "NW": 3},
            problem_types=["wind_slab", "persistent_weak_layers"],
            raw_text=(
                "Pericolo valanghe marcato (3) sui versanti settentrionali oltre i 2200 m. "
                "Lastroni da vento. [DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="it",
            source_url=f"https://bollettini.aineva.it/bulletin/latest?region={region}",
        )
