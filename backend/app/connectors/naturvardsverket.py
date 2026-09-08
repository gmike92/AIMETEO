"""
Naturvardsverket connector (Sweden) — REAL.

Source: same avalanche.report EAWS mirror as the other connectors in this
package (see eaws_mirror.py). Sweden publishes ONE national bulletin file,
5 micro-regions inside (Lappland fells, incl. Are/Kebnekaise):

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-SE.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 5 bulletins,
region IDs "SE-01","SE-02","SE-03","SE-07","SE-09", provider
"Naturvardsverket" (Swedish Environmental Protection Agency), already the
public-facing name for the Swedish avalanche bulletin (naturvardsverket.se/
lavinprognoser). No pinned subzone yet: fetch() falls back to the most
dangerous bulletin in the file.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class NaturvardsverketConnector(EawsMirrorConnector):
    service = "Naturvårdsverket"
    country = "SE"

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
            danger_by_aspect={"N": 2, "NE": 2, "E": 1, "SE": 1, "S": 1, "SW": 1, "W": 1, "NW": 2},
            problem_types=["wind_slab"],
            raw_text=(
                "Måttlig lavinfara (2) på nord- och ostsluttningar över kalfjället. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="sv",
            source_url="https://www.naturvardsverket.se/lavinprognoser",
        )
