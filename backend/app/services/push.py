"""
Notifiche push PWA — infrastruttura Web Push (VAPID).

Endpoints:
  GET  /push/vapid-public-key   → chiave pubblica per la subscription browser
  POST /push/subscribe          → registra una subscription (in-memory per ora)
  POST /push/send-test          → invia una notifica di prova a tutti gli iscritti
                                  (richiede pywebpush + chiavi VAPID; protetto da
                                  SCHEDULER_TOKEN se impostato)

Stato: infrastruttura pronta; la consegna reale richiede il deploy (il browser
consegna push solo da origini HTTPS). Storage in-memory finché non c'è auth —
stesso pattern del servizio alert.

Fail-safe: pywebpush assente o chiavi mancanti → 503 con spiegazione, mai
comportamenti silenziosi.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..config import settings

router = APIRouter(prefix="/push", tags=["push"])

#: subscription endpoint URL → subscription dict (in-memory, pre-auth).
_SUBS: dict[str, dict] = {}


class SubscribeRequest(BaseModel):
    subscription: dict           # oggetto PushSubscription.toJSON() dal browser
    topic: str = "generale"      # futuro: per-falesia / per-itinerario


class SubscribeResponse(BaseModel):
    ok: bool
    total_subscriptions: int


@router.get("/vapid-public-key")
def vapid_public_key() -> dict:
    if not settings.vapid_public_key:
        raise HTTPException(
            503, "Push non configurato: genera le chiavi con "
                 "scripts/gen_vapid.py e imposta VAPID_PUBLIC_KEY / "
                 "VAPID_PRIVATE_KEY nell'ambiente.")
    return {"key": settings.vapid_public_key}


@router.post("/subscribe", response_model=SubscribeResponse)
def subscribe(req: SubscribeRequest) -> SubscribeResponse:
    endpoint = (req.subscription or {}).get("endpoint")
    if not endpoint or "keys" not in req.subscription:
        raise HTTPException(422, "subscription non valida (manca endpoint/keys)")
    _SUBS[endpoint] = {"subscription": req.subscription, "topic": req.topic,
                       "created_at": datetime.now(timezone.utc).isoformat()}
    return SubscribeResponse(ok=True, total_subscriptions=len(_SUBS))


@router.post("/send-test")
def send_test(x_scheduler_token: Optional[str] = Header(None)) -> dict:
    if settings.scheduler_token and x_scheduler_token != settings.scheduler_token:
        raise HTTPException(401, "token mancante o errato")
    if not (settings.vapid_public_key and settings.vapid_private_key):
        raise HTTPException(503, "chiavi VAPID non configurate")
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        raise HTTPException(
            503, "pywebpush non installato: pip install pywebpush")
    if not _SUBS:
        return {"sent": 0, "note": "nessuna subscription registrata"}

    import json
    sent, dead = 0, []
    payload = json.dumps({
        "title": "Zerotermico — prova",
        "body": "Le notifiche funzionano. Presto: meteo e sole sulla tua falesia.",
        "url": "/",
    })
    for endpoint, rec in list(_SUBS.items()):
        try:
            webpush(
                subscription_info=rec["subscription"], data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            sent += 1
        except WebPushException as e:
            # 404/410 = subscription scaduta: la togliamo (igiene, no retry cieco)
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):
                dead.append(endpoint)
    for d in dead:
        _SUBS.pop(d, None)
    return {"sent": sent, "removed_expired": len(dead)}
