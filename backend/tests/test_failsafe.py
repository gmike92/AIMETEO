"""
Regression tests for audit fixes H1, H2, M2, M3, M4 — all offline (httpx mocked).

Run: cd backend && python tests/test_failsafe.py
"""
from __future__ import annotations

import json
import pathlib
import sys
from datetime import date
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import os
os.environ["USE_MOCK_DATA"] = "false"  # exercise the real fetch path (mocked transport)

import httpx  # noqa: E402
from app.connectors.aineva import AinevaConnector  # noqa: E402
from app.connectors.base import BulletinFetchError  # noqa: E402

FIX = pathlib.Path(__file__).resolve().parents[1] / "app" / "connectors" / "fixtures"
REAL = json.loads((FIX / "it-25_2024-02-15.json").read_text(encoding="utf-8"))
ON = date(2024, 2, 15)


def _resp(status: int, payload=None, text: str = "") -> httpx.Response:
    if payload is not None:
        return httpx.Response(status, json=payload, request=httpx.Request("GET", "http://x"))
    return httpx.Response(status, text=text, request=httpx.Request("GET", "http://x"))


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        sys.exit(1)


c = AinevaConnector()

print("== M2: prev-day fallback uses the URL actually fetched ==")
calls = []
def fake_get(url, **kw):
    calls.append(url)
    return _resp(404) if "2024-02-15" in url else _resp(200, REAL)
with patch("app.connectors.eaws_mirror.httpx.get", side_effect=fake_get):
    b = c.fetch("IT-25", subzone="IT-25-BG-02", on=ON)
check("fell back to previous day", len(calls) == 2 and "2024-02-14" in calls[1])
check("source_url = prev-day file (the one served)", b is not None and "2024-02-14" in b.source_url, str(b and b.source_url))

print("== M2: both days 404 -> None (off-season, verified absence) ==")
with patch("app.connectors.eaws_mirror.httpx.get", return_value=_resp(404)):
    check("None on double 404", c.fetch("IT-25", on=ON) is None)

print("== M2/H1: failures raise BulletinFetchError (never None) ==")
FAILURE_MODES = {
    "network error": httpx.ConnectError("boom"),
    "server 500": _resp(500),
    "bad JSON": _resp(200, None, text="<html>not json</html>"),
}
for name, effect in FAILURE_MODES.items():
    try:
        with patch("app.connectors.eaws_mirror.httpx.get",
                   side_effect=effect if isinstance(effect, Exception) else [effect]):
            c.fetch("IT-25", on=ON)
        check(f"{name} raises BulletinFetchError", False)
    except BulletinFetchError:
        check(f"{name} raises BulletinFetchError", True)

print("== M2: expired bulletin -> None (not served as in force) ==")
expired = json.loads(json.dumps(REAL))
for bb in expired["bulletins"]:
    bb.setdefault("validTime", {})["endTime"] = "2024-02-13T22:59:59+00:00"  # before ON
with patch("app.connectors.eaws_mirror.httpx.get", return_value=_resp(200, expired)):
    check("expired -> None", c.fetch("IT-25", subzone="IT-25-BG-02", on=ON) is None)
# ...but a bulletin valid on the requested (historical) day is served
with patch("app.connectors.eaws_mirror.httpx.get", return_value=_resp(200, REAL)):
    check("valid-on-day historical bulletin served",
          c.fetch("IT-25", subzone="IT-25-BG-02", on=ON) is not None)

print("== H1: planner fail-closed on fetch error (snow) / unaffected (non-snow) ==")
os.environ["USE_MOCK_DATA"] = "true"
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.connectors import registry  # noqa: E402
# IT/CH/AT/SI share this one base class (see eaws_mirror.py) — patching it
# fails ALL FOUR real connectors at once, same as patching each separately.
# Necessary since scialpinismo/escursionismo routes now exist in all four,
# not just Italy (France stays deterministic on its own: UnavailableConnector
# always raises, no patch needed) — keeps this suite fully offline as its own
# docstring promises, instead of hitting the real mirror for CH/AT/SI.
from app.connectors.eaws_mirror import EawsMirrorConnector  # noqa: E402

client = TestClient(app)
payload = {"intent_text": "gita", "activity": "scialpinismo"}

# Counts derive from the store, not hardcoded — the seed grows over time.
from app import store  # noqa: E402
N_SKI = sum(1 for r in store.list_routes() if r["activity"] == "scialpinismo")
N_HIKE = sum(1 for r in store.list_routes() if r["activity"] == "escursionismo")

with patch.object(EawsMirrorConnector, "fetch",
                  side_effect=BulletinFetchError("mirror down")), \
     patch("app.services.planner._now_month", return_value=2):
    plan = client.post("/planner/plan", json=payload).json()
    check("all snow routes blocked on fetch error",
          len(plan["safe_candidates"]) == 0 and len(plan["blocked"]) == N_SKI, str(plan)[:200])
    check("reason says non verificabile",
          all("non è verificabile" in r for c_ in plan["blocked"] for r in c_["block_reasons"]))
    check("planner says rimanda", "rimanda" in (plan["plan_text"] or "").lower())

    hike = client.post("/planner/plan",
                       json={"intent_text": "camminata", "activity": "escursionismo"}).json()
    check("non-snow activity still evaluated",
          len(hike["safe_candidates"]) + len(hike["blocked"]) == N_HIKE, str(hike)[:200])

print("== H1: planner fail-closed when bulletin is None in snow season ==")
# The mock forecast follows the real calendar; force winter so the
# snow-season fail-closed rule is exercised regardless of when tests run.
with patch.object(EawsMirrorConnector, "fetch", return_value=None), \
     patch("app.services.planner._season", return_value="winter"), \
     patch("app.services.planner._now_month", return_value=2):
    plan = client.post("/planner/plan", json=payload).json()
    check("no-bulletin (winter) blocks snow routes",
          len(plan["safe_candidates"]) == 0 and len(plan["blocked"]) == N_SKI, str(plan)[:200])

print("== H2: planner imports safety filters from inside the package ==")
import app.services.planner as planner_mod  # noqa: E402
check("sf module is app.safety_filters", planner_mod.sf.__name__ == "app.safety_filters")
check("trip-planner shim re-exports the same module",
      __import__("importlib").import_module("app.safety_filters").evaluate
      is planner_mod.sf.evaluate)

print("\nALL FAILSAFE TESTS PASSED")
