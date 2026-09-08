"""
SAIS connector (Great Britain / Scotland) — REAL.

Source: same avalanche.report EAWS mirror as the other connectors in this
package (see eaws_mirror.py). Great Britain publishes ONE national bulletin
file — in practice Scotland only, 6 micro-regions inside (the historic
Scottish forecast areas: Lochaber, Glencoe, Creag Meagaidh, Southern
Cairngorms, Northern Cairngorms, Torridon):

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-GB.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 6 bulletins,
region IDs "GB-SCT-2".."GB-SCT-7", provider "SAIS" (Scottish Avalanche
Information Service), already the public-facing name. No pinned subzone
yet: fetch() falls back to the most dangerous bulletin in the file.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class SaisConnector(EawsMirrorConnector):
    service = "SAIS"
    country = "GB"

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
            problem_types=["wind_slab", "persistent_weak_layers"],
            raw_text=(
                "Considerable avalanche hazard (3) on north to east facing slopes above 900 m. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="en",
            source_url="https://www.sais.gov.uk/",
        )
