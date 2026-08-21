"""
Connector registry — resolves the right avalanche connector by service (or country).

Expansion = add one line here:
    register(LwdConnector())   # Austria
    register(SlfConnector())   # Switzerland
"""
from __future__ import annotations
from .base import AvalancheConnector
from .aineva import AinevaConnector
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


# ── Register connectors at import (Italy live; others to come) ──────
register(AinevaConnector())
# France: area+route data now exists (escursionismo/via_ferrata), but no real
# Météo-France/ANENA connector yet. Registering an honest "unavailable"
# placeholder (never invents a danger rating) instead of leaving the country
# unregistered — an unregistered country would 503 the WHOLE planner request
# for any activity, not just fail-closed-block the affected snow routes.
register(UnavailableConnector(service="ANENA-TODO", country="FR"))
# register(MeteomontConnector())   # IT alternative
# register(LwdConnector())         # AT
# register(SlfConnector())         # CH
# register(ArsoConnector())        # SI
