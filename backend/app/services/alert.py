"""
Alert service — "Avvisami se cambiano le condizioni." (roadmap #5)

Subscribe: captures a plan-time snapshot (official bulletin in force for the
route's zone). Run: `POST /alert/run` — invoked by Cloud Scheduler every 1–3 h
(OIDC in prod; optional shared-secret header meanwhile) — re-fetches conditions,
diffs against each subscription's snapshot, and fires AlertEvents.

Fired triggers (all bulletin-driven; forecast triggers arm once routes have
real coordinates):
- new_bulletin         a newer official bulletin was issued
- danger_up            the official danger level increased
- bulletin_unavailable had a bulletin at subscribe time, now unverifiable (fail-closed)

Storage is in-memory (single instance). The shapes match 1:1 what moves into
Postgres + push notifications when the auth layer lands.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException, Query
from ..models import AlertEvent, AlertSnapshot, AlertSubscription
from ..config import settings
from ..connectors import registry
from ..connectors.base import BulletinFetchError
from .. import store

log = logging.getLogger(__name__)
router = APIRouter(prefix="/alert", tags=["alert"])

_SUBS: list[AlertSubscription] = []
_EVENTS: list[AlertEvent] = []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fetch_bulletin_for_route(route: dict, cache: dict):
    """Official bulletin for the route's zone, memoized per run. Never authored by us."""
    area = store.area_for_route(route) or {}
    country = area.get("country", settings.default_country)
    key = (country, area.get("avalanche_zone"), area.get("avalanche_subzone"))
    if key not in cache:
        try:
            connector = registry.get_for_country(country)
            cache[key] = connector.fetch(
                region=area.get("avalanche_zone", "UNKNOWN"),
                subzone=area.get("avalanche_subzone"),
            )
        except (KeyError, BulletinFetchError) as e:
            cache[key] = e
    return cache[key]


def _snapshot(route: dict) -> AlertSnapshot:
    result = _fetch_bulletin_for_route(route, {})
    if isinstance(result, Exception):
        return AlertSnapshot(taken_at=_now(), bulletin_unavailable=True)
    if result is None:  # off-season / none in force
        return AlertSnapshot(taken_at=_now())
    return AlertSnapshot(
        taken_at=_now(),
        bulletin_issued_at=result.issued_at,
        bulletin_danger=result.danger_level,
    )


@router.post("/subscribe")
def subscribe(sub: AlertSubscription) -> dict:
    route = store.get_route(sub.route_id)
    if not route:
        raise HTTPException(404, f"route '{sub.route_id}' not found")
    sub.snapshot = _snapshot(route)  # server-side baseline; client value ignored
    _SUBS.append(sub)
    return {"status": "subscribed", "triggers": sub.triggers,
            "snapshot": sub.snapshot.model_dump(mode="json")}


@router.get("/subscriptions")
def subscriptions(user_id: str = Query(..., description="return only this user's subscriptions")) -> list[AlertSubscription]:
    """Scoped to a single user_id — never dumps the whole subscriber list (audit L)."""
    return [s for s in _SUBS if s.user_id == user_id]


@router.get("/notifications")
def notifications(user_id: str = Query(...)) -> list[AlertEvent]:
    """Fired alerts for one user (newest first). Push delivery lands with auth."""
    return sorted((e for e in _EVENTS if e.user_id == user_id),
                  key=lambda e: e.fired_at, reverse=True)


def _diff(sub: AlertSubscription, route: dict, current) -> list[AlertEvent]:
    """Compare current conditions vs the subscription snapshot."""
    snap = sub.snapshot
    events: list[AlertEvent] = []

    def fire(trigger: str, message: str):
        events.append(AlertEvent(user_id=sub.user_id, route_id=sub.route_id,
                                 trigger=trigger, message=message, fired_at=_now()))

    if isinstance(current, Exception):
        # Fail-closed messaging: we can't verify → say so, never imply "no change".
        if snap and not snap.bulletin_unavailable and snap.bulletin_danger is not None:
            fire("bulletin_unavailable",
                 f"{route['name']}: il bollettino valanghe ufficiale non è al momento "
                 f"verificabile. Prudenza: l'ultimo grado noto era "
                 f"{snap.bulletin_danger}/5, ma potrebbe essere cambiato.")
        return events

    if current is None:
        return events  # no bulletin in force (off-season) — nothing to diff

    if "new_bulletin" in sub.triggers and snap and snap.bulletin_issued_at \
            and current.issued_at > snap.bulletin_issued_at:
        fire("new_bulletin",
             f"{route['name']}: nuovo bollettino ufficiale "
             f"{current.avalanche_service} ({current.issued_at:%d/%m %H:%M} UTC), "
             f"grado {current.danger_level}/5. Fonte: {current.source_url}")

    if snap and snap.bulletin_danger is not None \
            and current.danger_level > snap.bulletin_danger:
        fire("danger_up",
             f"{route['name']}: il pericolo valanghe ufficiale è salito da "
             f"{snap.bulletin_danger}/5 a {current.danger_level}/5 "
             f"({current.avalanche_service}). Rivaluta il piano. "
             f"Fonte: {current.source_url}")

    return events


@router.post("/run")
def run(x_scheduler_token: str | None = Header(default=None)) -> dict:
    """
    Scheduled evaluation (Cloud Scheduler target). Diffs every subscription
    against live conditions; fires and stores AlertEvents.
    """
    if settings.scheduler_token and x_scheduler_token != settings.scheduler_token:
        raise HTTPException(403, "invalid scheduler token")

    cache: dict = {}
    fired: list[AlertEvent] = []
    for sub in _SUBS:
        route = store.get_route(sub.route_id)
        if not route:
            continue
        current = _fetch_bulletin_for_route(route, cache)
        events = _diff(sub, route, current)
        if events and not isinstance(current, Exception) and current is not None:
            # Move the baseline forward so the same change doesn't re-fire every run.
            sub.snapshot = AlertSnapshot(
                taken_at=_now(), bulletin_issued_at=current.issued_at,
                bulletin_danger=current.danger_level,
            )
        fired.extend(events)
    _EVENTS.extend(fired)
    log.info("alert run: %d subscriptions, %d fired", len(_SUBS), len(fired))
    return {"evaluated": len(_SUBS), "fired": len(fired),
            "events": [e.model_dump(mode="json") for e in fired]}


@router.post("/_evaluate", deprecated=True)
def evaluate_now() -> dict:
    """Backward-compatible alias for /alert/run (no token check in local dev)."""
    if settings.scheduler_token:
        raise HTTPException(403, "use POST /alert/run with X-Scheduler-Token")
    return run(x_scheduler_token=None)
