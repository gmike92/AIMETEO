"""
SLF connector (Switzerland) — REAL.

Source: same avalanche.report EAWS mirror as AINEVA (see eaws_mirror.py) —
SLF (WSL Institute for Snow and Avalanche Research) publishes ONE national
bulletin file, not split by canton like Italy's:

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-CH.json

Verified live 2026-09-03 (winter sample date): provider "SLF",
https://whiterisk.ch/en/conditions. Micro-regions inside the file look like
"CH-7222" — our areas (Zermatt/Engadina/Jungfrau) don't carry a specific
subzone yet, so fetch() falls back to the most dangerous bulletin in the
file (documented conservative default, never an invented "safe" pick).
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class SlfConnector(EawsMirrorConnector):
    service = "SLF"
    country = "CH"

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
            danger_by_aspect={"N": 2, "NE": 2, "E": 2, "SE": 1, "S": 1, "SW": 1, "W": 2, "NW": 2},
            problem_types=["persistent_weak_layers"],
            raw_text=(
                "Gefahrenstufe mässig (2) oberhalb 2400 m. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="de",
            source_url="https://whiterisk.ch/en/conditions",
        )
