"""
AINEVA connector (Italy) — REAL.

Source: official EAWS/AINEVA bulletins published as CAAML v6 JSON on the avalanche.report
static mirror, one file per macro-region per day:

    https://static.avalanche.report/eaws_bulletins/{YYYY-MM-DD}/{YYYY-MM-DD}-{REGION}.json

Region file ids (verified): IT-25 (Lombardia), IT-23 (Valle d'Aosta), IT-32-BZ (Alto Adige),
IT-32-TN (Trentino), IT-34 (Veneto), IT-21 (Piemonte), IT-36 (FVG). Each file holds several
bulletins, each covering a list of micro-regions (regionID). We pick the bulletin matching
the route's micro-region; if unknown, we take the most dangerous in the file (conservative).

Fetch/parse/expiry logic lives in eaws_mirror.py, shared with every other EAWS service on
this same mirror (SLF/LWD/ARSO — see slf.py/lwd.py/arso.py): the CAAML format and the mirror
are identical across countries, only the region file and service name differ.

USE_MOCK_DATA=true returns a deterministic mock (offline dev / off-season).
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class AinevaConnector(EawsMirrorConnector):
    service = "AINEVA"
    country = "IT"

    def _mock(self, region: str, subzone: Optional[str]) -> Optional[Bulletin]:
        # Demo stagionale di ripiego (USE_MOCK_DATA=true) — fuori stagione
        # si comporta come il servizio vero (nessun bollettino in vigore),
        # così la UI mostra lo stato reale anche in mock.
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
                "Pericolo valanghe marcato (3) sui versanti settentrionali oltre i 2200 m. "
                "Lastroni da vento. [DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="it",
            source_url=f"https://bollettini.aineva.it/bulletin/latest?region={region}",
        )
