"""
Connector registry — resolves the right avalanche connector by service (or country).

Expansion = add one line here:
    register(LwdConnector())   # Austria
    register(SlfConnector())   # Switzerland
"""
from __future__ import annotations
from .base import AvalancheConnector
from .aineva import AinevaConnector
from .slf import SlfConnector
from .lwd import LwdConnector
from .arso import ArsoConnector
from .mf import MeteoFranceConnector
from .unavailable import UnavailableConnector

_BY_SERVICE: dict[str, AvalancheConnector] = {}
_DEFAULT_BY_COUNTRY: dict[str, str] = {}


def register(connector: AvalancheConnector, *, default_for_country: bool = True) -> None:
    _BY_SERVICE[connector.service] = connector
    if default_for_country and connector.country:
        _DEFAULT_BY_COUNTRY.setdefault(connector.country, connector.service)


def get_by_service(service: str) -> AvalancheConnector:
    if service not in _BY_SERVICE:
        raise KeyError(f"No avalanche connector registered for service '{service}'")
    return _BY_SERVICE[service]


def get_for_country(country: str) -> AvalancheConnector:
    service = _DEFAULT_BY_COUNTRY.get(country)
    if not service:
        raise KeyError(f"No default avalanche connector for country '{country}'")
    return _BY_SERVICE[service]


def registered_services() -> list[str]:
    return sorted(_BY_SERVICE)


# ── Register connectors at import ────────────────────────────────────
register(AinevaConnector())
# Stesso mirror EAWS gratuito di AINEVA (avalanche.report), solo un file
# regione diverso — vedi eaws_mirror.py e slf.py/lwd.py/arso.py per come
# sono stati verificati (2026-09-03, data invernale di prova).
register(SlfConnector())   # CH
register(LwdConnector())   # AT
register(ArsoConnector())  # SI
# Francia: stesso mirror EAWS gratuito di sopra — Météo France pubblica un
# file nazionale unico ("FR"), verificato 2026-09-03. Sostituisce il vecchio
# placeholder "ANENA-TODO": ANENA è un ente francese reale ma non è chi
# pubblica su questo mirror, Météo France sì (vedi mf.py).
register(MeteoFranceConnector())
# Paesi extra-europei già nel catalogo (import_osm_hiking.py, prima di
# questa sessione) — solo escursionismo/MTB oggi, nessuna attività da neve,
# ma un domani senza placeholder darebbero comunque il 503 di briefing.py
# sopra. Nome di servizio identico a area.avalanche_service nel seed (deve
# combaciare, vedi base.py) — un ente reale per paese, mai un segnaposto
# generico: NWAC (Northwest Avalanche Center, USA), Avalanche Canada, New
# Zealand Avalanche Advisory, Lawinenwarndienst (Germania, per Land), Japan
# Avalanche Network.
register(UnavailableConnector(service="NWAC-TODO", country="US"))
register(UnavailableConnector(service="AvCan-TODO", country="CA"))
register(UnavailableConnector(service="NZAA-TODO", country="NZ"))
register(UnavailableConnector(service="LWZ-TODO", country="DE"))
register(UnavailableConnector(service="JAN-TODO", country="JP"))
# register(MeteomontConnector())   # IT alternativa
