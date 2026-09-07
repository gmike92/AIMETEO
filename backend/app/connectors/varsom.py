"""
Varsom connector (Norway) — REAL.

Source: same avalanche.report EAWS mirror as AINEVA/SLF/LWD/ARSO/Meteo France
(see eaws_mirror.py). Norway publishes ONE national bulletin file covering
many micro-regions inside it, like Italy's per-region files:

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-NO.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 24 bulletins in the
file, region IDs like "NO-3003", published by provider "NVE" (Norges
vassdrags- og energidirektorat) under the public brand varsom.no — same
ANENA/Meteo-France situation as mf.py: the technical publisher and the
public-facing service name differ, we attribute to the name people actually
know (must match area.avalanche_service, see base.py). Our areas (Jotunheimen/
Lofoten/Lillehammer) don't carry a pinned subzone yet, so fetch() falls back
to the most dangerous bulletin in the file (documented conservative default,
never an invented "safe" pick) — same interim state SLF/LWD/ARSO started in
before pin_avalanche_subzones.py.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class VarsomConnector(EawsMirrorConnector):
    service = "Varsom"
    country = "NO"

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
            danger_level=3,
            danger_by_aspect={"N": 3, "NE": 3, "E": 2, "SE": 2, "S": 1, "SW": 1, "W": 2, "NW": 3},
            problem_types=["persistent_weak_layers"],
            raw_text=(
                "Betydelig skredfare (3) i le-omrader over 900 moh. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="no",
            source_url="https://www.varsom.no/en/avalanches/avalanche-warnings/",
        )
