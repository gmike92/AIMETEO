"""
Offline regression tests for the live-provider integrations (roadmap #2–#6):
Gemini briefings/planner, Google Weather forecast, Earth Engine terrain,
alert diff job, waitlist. No network: everything mocked.

Run: cd backend && python tests/test_integrations.py
"""
from __future__ import annotations

import pathlib
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import os
os.environ["USE_MOCK_DATA"] = "true"   # default offline; flipped per-check via patch
os.environ.pop("DATABASE_URL", None)

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import llm, prompts, store  # noqa: E402
from app.models import Bulletin  # noqa: E402
from app.providers import google_weather, earth_engine  # noqa: E402
from app.services import alert as alert_svc  # noqa: E402

client = TestClient(app)


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        sys.exit(1)


NOW = datetime(2026, 2, 10, 8, 0, tzinfo=timezone.utc)

BULLETIN = Bulletin(
    avalanche_service="AINEVA", avalanche_zone="IT-25", country="IT",
    issued_at=NOW - timedelta(hours=10), danger_level=2,
    danger_by_aspect={"N": 2, "NE": 2}, problem_types=["wind_slab"],
    raw_text="Pericolo moderato sopra i 2000 m.", source_url="https://example.org/b",
)

ROUTE = store.get_route("scialpinismo-monte-vioz-da-pejo")


# ── Gemini: fail-safe + grounding ───────────────────────────────────
print("== Gemini: offline / unconfigured never breaks the API ==")
check("llm not configured in mock mode", not llm.is_configured())
try:
    llm.generate_json("s", "u", prompts.BRIEFING_SCHEMA)
    check("generate_json raises when unconfigured", False)
except llm.GeminiUnavailable:
    check("generate_json raises when unconfigured", True)

print("== Gemini: payload builders ground on data, never invent ==")
payload = prompts.build_briefing_payload(ROUTE, BULLETIN, None, "it")
check("official danger verbatim", "grado 2/5" in payload)
check("source link included", BULLETIN.source_url in payload)
check("bulletin text verbatim", BULLETIN.raw_text in payload)
check("missing forecast disclosed, not invented",
      "METEO sull'itinerario: non disponibile" in payload)
check("missing sunrise = non disponibile", "ALBA prevista: non disponibile" in payload)
route_no_slope = dict(ROUTE, max_slope_deg=None, exposure_notes=None)
p2 = prompts.route_context(route_no_slope, None, None)
check("None fields render as 'non disponibile'", p2.count("non disponibile") >= 3)
check("no-bulletin case disclosed", "nessun bollettino in vigore" in p2)
check("system forbids AI danger ratings",
      "Non esprimere MAI un tuo grado di pericolo" in prompts.SYSTEM_INSTRUCTION)

print("== Gemini: briefing falls back to deterministic stub ==")
with patch("app.services.briefing.registry.get_for_country") as g:
    g.return_value.fetch.return_value = BULLETIN
    r = client.post("/briefing", json={"route_id": ROUTE["slug"], "locale": "it"})
check("briefing 200 with Gemini down", r.status_code == 200, r.text)
check("model reports deterministic-stub", r.json()["model"] == "deterministic-stub")
check("official danger still in text", "2/5" in r.json()["text"])

print("== Gemini: briefing uses model output when available ==")
with patch("app.services.briefing.registry.get_for_country") as g, \
     patch("app.services.briefing.llm.generate_json",
           return_value={"relazione": "Relazione di prova."}), \
     patch("app.services.briefing.llm.GeminiUnavailable", llm.GeminiUnavailable):
    g.return_value.fetch.return_value = BULLETIN
    r = client.post("/briefing", json={"route_id": ROUTE["slug"], "locale": "it"})
check("text is the Gemini relazione", r.json()["text"] == "Relazione di prova.")
check("model reports the vertex model", r.json()["model"] != "deterministic-stub")

print("== Planner: seasonality gate ==")
with patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=8):
    g.return_value.fetch.return_value = BULLETIN
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "sci", "activity": "scialpinismo"})
check("scialpinismo in August: zero safe", r.json()["safe_candidates"] == [])
check("blocked with seasonality reason",
      all("fuori stagione" in b["block_reasons"][0] for b in r.json()["blocked"]))
with patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=8), \
     patch("app.services.planner.store.list_routes",
           return_value=[dict(ROUTE, season_months=[8])]):
    g.return_value.fetch.return_value = BULLETIN
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "sci", "activity": "scialpinismo"})
check("curator season_months override honored", len(r.json()["safe_candidates"]) == 1)

print("== Planner: Gemini plan when available, stub otherwise ==")
with patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=2):
    g.return_value.fetch.return_value = BULLETIN
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "vioz domani", "activity": "scialpinismo"})
body = r.json()
check("plan 200 offline", r.status_code == 200, r.text)
check("plan_model=deterministic-stub offline", body["plan_model"] == "deterministic-stub")
check("plan json absent offline", body["plan"] is None)
check("mock forecast disclosed", body["forecast_notice"] is not None)

FAKE_PLAN = {"titolo": "Monte Vioz", "itinerario": "Salita da Pejo.",
             "bollettino_valanghe": {"grado_ufficiale": "2", "fonte": "AINEVA",
                                     "link": BULLETIN.source_url}}
with patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=2), \
     patch("app.services.planner.llm.generate_json", return_value=FAKE_PLAN):
    g.return_value.fetch.return_value = BULLETIN
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "vioz", "activity": "scialpinismo"})
body = r.json()
check("plan json present when Gemini answers", body["plan"] == FAKE_PLAN)
check("plan_text from Gemini itinerario", body["plan_text"] == "Salita da Pejo.")

print("== Planner: Gemini NEVER sees blocked routes ==")
danger4 = Bulletin(**{**BULLETIN.model_dump(), "danger_level": 4,
                      "danger_by_aspect": {"N": 4, "NE": 4, "E": 4, "S": 4, "SE": 4, "SW": 4, "W": 4, "NW": 4}})
captured = {}
def _capture(sys_i, payload, schema, **kw):
    captured["payload"] = payload
    raise llm.GeminiUnavailable("stop")
with patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=2), \
     patch("app.services.planner.llm.generate_json", side_effect=_capture):
    g.return_value.fetch.return_value = danger4
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "x", "activity": "scialpinismo"})
check("all snow routes blocked at danger 4", r.json()["safe_candidates"] == [])
check("Gemini not even called with zero candidates", "payload" not in captured)

# ── Forecast provider ───────────────────────────────────────────────
print("== Forecast: normalize maps the real API shape ==")
API_PAYLOAD = {
    "currentTime": "2026-02-10T08:00:00Z",
    "temperature": {"degrees": -3.0, "unit": "CELSIUS"},
    "wind": {"speed": {"value": 20, "unit": "KILOMETERS_PER_HOUR"},
             "gust": {"value": 45, "unit": "KILOMETERS_PER_HOUR"}},
    "precipitation": {"probability": {"percent": 10, "type": "SNOW"},
                      "qpf": {"quantity": 1.5, "unit": "MILLIMETERS"}},
    "thunderstormProbability": 5,
    "currentConditionsHistory": {"temperatureChange": {"degrees": 2.5}},
}
fc, dt24 = google_weather.normalize(API_PAYLOAD, 46.4, 10.6, altitude_m=2000)
check("temp verbatim", fc.temp_c == -3.0)
check("wind avg/gust verbatim", fc.wind_avg_kmh == 20 and fc.wind_gust_kmh == 45)
check("precip qpf verbatim", fc.precip_mm == 1.5)
check("thunderstorm prob 0-1", fc.thunderstorm_prob == 0.05)
check("temp change 24h", dt24 == 2.5)
# -3°C at 2000 m, 6.5°C/km → zero termico ≈ 2000 - 3/0.0065 ≈ 1538
check("freezing level derived by lapse rate", fc.freezing_level_m == 2000 + round(-3.0 / 0.0065),
      str(fc.freezing_level_m))
check("derivation disclosed in source", "derivato" in fc.source)

print("== Forecast: fail-safe paths ==")
try:
    google_weather.fetch_point(46.4, 10.6)
    check("fetch_point raises when unconfigured", False)
except google_weather.ForecastFetchError:
    check("fetch_point raises when unconfigured", True)
try:
    google_weather.normalize({"garbage": True}, 0, 0, 0)
    check("bad payload raises, never guesses", False)
except google_weather.ForecastFetchError:
    check("bad payload raises, never guesses", True)
r = client.get("/forecast/point", params={"lat": 46.4, "lon": 10.6})
check("mock endpoint still works", r.status_code == 200 and r.json()["source"] == "mock")

print("== Forecast: cache ==")
key = google_weather._geohash(46.4001, 10.6002)
check("geohash grid ~1km", key == "46.40,10.60", key)
google_weather._cache_put(key, fc)
check("cache hit", google_weather._cache_get(key) is fc)

# ── Terrain ─────────────────────────────────────────────────────────
print("== Terrain: metadata fallback + aspect math ==")
r = client.get(f"/terrain/{ROUTE['slug']}")
check("terrain 200", r.status_code == 200)
check("source disclosed as route-metadata", r.json()["source"] == "route-metadata")
for deg, card in [(0, "N"), (44, "NE"), (90, "E"), (180, "S"), (270, "W"), (359, "N")]:
    check(f"aspect {deg}° → {card}", earth_engine.aspect_to_cardinal(deg) == card)
check("EE not configured offline", not earth_engine.is_configured())
try:
    earth_engine.sample_track([])
    check("no coordinates → error, never fabricated", False)
except earth_engine.TerrainFetchError:
    check("no coordinates → error, never fabricated", True)

# ── Alerts ──────────────────────────────────────────────────────────
print("== Alerts: snapshot + diff job ==")
alert_svc._SUBS.clear(); alert_svc._EVENTS.clear()
with patch("app.services.alert.registry.get_for_country") as g:
    g.return_value.fetch.return_value = BULLETIN
    r = client.post("/alert/subscribe", json={"user_id": "u1", "route_id": ROUTE["slug"]})
check("subscribe 200 + snapshot", r.status_code == 200
      and r.json()["snapshot"]["bulletin_danger"] == 2)

newer = Bulletin(**{**BULLETIN.model_dump(),
                    "issued_at": NOW + timedelta(hours=2), "danger_level": 3,
                    "danger_by_aspect": {"N": 3, "NE": 3}})
with patch("app.services.alert.registry.get_for_country") as g:
    g.return_value.fetch.return_value = newer
    r = client.post("/alert/run")
events = r.json()["events"]
check("run fires on change", r.json()["fired"] >= 2, str(events))
triggers = {e["trigger"] for e in events}
check("new_bulletin fired", "new_bulletin" in triggers)
check("danger_up fired", "danger_up" in triggers)
check("official source in message",
      any(BULLETIN.source_url.rsplit("/", 1)[0] in e["message"] for e in events))

with patch("app.services.alert.registry.get_for_country") as g:
    g.return_value.fetch.return_value = newer
    r = client.post("/alert/run")
check("baseline advanced: same change doesn't re-fire", r.json()["fired"] == 0)

from app.connectors.base import BulletinFetchError
with patch("app.services.alert.registry.get_for_country") as g:
    g.return_value.fetch.side_effect = BulletinFetchError("down")
    r = client.post("/alert/run")
check("unverifiable bulletin → fail-closed warning",
      any(e["trigger"] == "bulletin_unavailable" for e in r.json()["events"]))

r = client.get("/alert/notifications", params={"user_id": "u1"})
check("notifications scoped to user", r.status_code == 200 and len(r.json()) >= 2)
check("other users see nothing",
      client.get("/alert/notifications", params={"user_id": "u2"}).json() == [])

print("== Alerts: scheduler token ==")
with patch("app.services.alert.settings") as s:
    s.scheduler_token = "sekret"
    check("run without token → 403", client.post("/alert/run").status_code == 403)
    ok = client.post("/alert/run", headers={"X-Scheduler-Token": "sekret"})
    check("run with token → 200", ok.status_code == 200)

# ── Waitlist ────────────────────────────────────────────────────────
print("== Waitlist ==")
r = client.post("/waitlist", json={"email": "Michele.Test@Example.COM", "source": "landing"})
check("valid email → ok", r.status_code == 200 and r.json()["status"] == "ok")
from app.services.waitlist import _MEM
check("stored lowercase", "michele.test@example.com" in _MEM)
check("invalid email → 422",
      client.post("/waitlist", json={"email": "not-an-email"}).status_code == 422)
r = client.post("/waitlist", json={"email": "michele.test@example.com"})
check("duplicate is idempotent", r.status_code == 200 and len(_MEM) == 1)

print("== Meteo lungo l'itinerario (quote reali) ==")
r = client.get("/routes/alpinismo-gran-paradiso-via-normale/weather")
check("route weather 200", r.status_code == 200, r.text[:100])
w = r.json()
check("3 punti campionati", [p["label"] for p in w["points"]] == ["partenza", "meta", "vetta"])
check("quote reali crescenti partenza<vetta",
      w["points"][0]["ele_m"] < w["points"][-1]["ele_m"])
check("vetta ~4020 m (dalla traccia, non dalla scheda)",
      abs(w["points"][-1]["ele_m"] - 4020) < 5, str(w["points"][-1]["ele_m"]))
check("mock disclosed", w["is_demo"] and w["points"][0]["forecast"]["source"] == "mock")
check("temperatura cala con la quota (lapse demo)",
      w["points"][-1]["forecast"]["temp_c"] < w["points"][0]["forecast"]["temp_c"])
check("no track -> 404",
      client.get("/routes/scialpinismo-monte-vioz-da-pejo/weather").status_code == 404)
from app.services.route_weather import route_weather as _rw
_block = prompts.weather_along_route_block(_rw("alpinismo-gran-paradiso-via-normale").points)
check("payload Gemini: blocco meteo per punto", "vetta (40" in _block and "zero termico" in _block)
check("payload Gemini: mock marcato", "[DATI DIMOSTRATIVI]" in _block)

print("== GPX export (roundtrip through our own parser) ==")
r = client.get("/routes/alpinismo-gran-paradiso-via-normale/gpx")
check("gpx 200 for ingested route", r.status_code == 200, r.text[:100])
check("content-type gpx", "gpx" in r.headers.get("content-type", ""))
check("attribution travels with the file", "Camptocamp" in r.text)
from app import gpx as gpxmod
_pts = gpxmod.parse_gpx(r.text)
check("roundtrip: our parser reads our export", len(_pts) >= 100)
check("elevations preserved", _pts[0].ele is not None)
check("no track -> 404, never fabricated",
      client.get("/routes/scialpinismo-monte-vioz-da-pejo/gpx").status_code == 404)
check("unknown route -> 404",
      client.get("/routes/nope/gpx").status_code == 404)

print("== Container-import simulation (all routers mount) ==")
# via openapi so it works across FastAPI versions (lazy router inclusion)
paths = set(client.get("/openapi.json").json()["paths"].keys())
for p in ["/waitlist", "/alert/run", "/planner/plan", "/briefing",
          "/forecast/point", "/terrain/{slug}", "/routes/{slug}/gpx", "/conditions"]:
    check(f"route mounted: {p}", p in paths)

print("\nALL INTEGRATION CHECKS PASSED")
