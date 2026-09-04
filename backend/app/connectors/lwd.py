"""
LWD Tirol connector (Austria) — REAL.

Source: same avalanche.report EAWS mirror as AINEVA (see eaws_mirror.py).
File "AT-07" covers Tirol (where our areas Ötztal/Zillertal both sit) plus
some neighbouring Länder bundled into the same daily file by the mirror:

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-AT-07.json

Verified live 2026-09-03 (winter sample date): provider "LWD Tirol",
https://avalanche.report. No specific subzone set for our areas yet, so
fetch() falls back to the most dangerous bulletin in the file (documented
conservative default, never an invented "safe" pick).
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class LwdConnector(EawsMirrorConnector):
    service = "LWD"
    country = "AT"

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
            danger_by_aspect={"N": 3, "NE": 3, "E": 2, "SE": 2, "S": 2, "SW": 2, "W": 2, "NW": 3},
            problem_types=["wind_slab"],
            raw_text=(
                "Erhebliche Lawinengefahr (3) oberhalb der Waldgrenze. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="de",
            source_url="https://avalanche.report",
        )
