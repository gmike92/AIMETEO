"""
ARSO connector (Slovenia) — REAL.

Source: same avalanche.report EAWS mirror as AINEVA (see eaws_mirror.py) —
ARSO METEO publishes ONE national bulletin file, like Switzerland:

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-SI.json

Verified live 2026-09-03 (winter sample date): provider "ARSO METEO",
https://meteo.arso.gov.si. No specific subzone set for our area (Triglav)
yet, so fetch() falls back to the most dangerous bulletin in the file
(documented conservative default, never an invented "safe" pick).
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class ArsoConnector(EawsMirrorConnector):
    service = "ARSO"
    country = "SI"

    def _mock(self, region: str, subzone: Optional[str]) -> Optional[Bulletin]:
        now = self._now()
        if now.month in self.OFF_SEASON_MONTHS:
            return None
        return Bulletin(
            avalanche_service=self.service,
            avalanche_zone=subzone or region,
            country=self.country,
            issued_at=now,
            valid_until=now + timedelta(hours=24),
            danger_level=2,
            danger_by_aspect={"N": 2, "NE": 2, "E": 2, "SE": 1, "S": 1, "SW": 1, "W": 1, "NW": 2},
            problem_types=["persistent_weak_layers"],
            raw_text=(
                "Zmerna nevarnost snežnih plazov (2) nad 2000 m. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="sl",
            source_url="https://meteo.arso.gov.si/met/en/weather/bulletin/mountain/avalanche/bulletin/",
        )
