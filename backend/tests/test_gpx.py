"""
GPX ingestion tests (roadmap #4a) — offline, synthetic test coordinates.

Run: cd backend && python tests/test_gpx.py
"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import os
os.environ["USE_MOCK_DATA"] = "true"
os.environ.pop("DATABASE_URL", None)

from app import gpx  # noqa: E402


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        sys.exit(1)


# Synthetic track: ~north-bound line, 1 point every ~0.0005° lat (~55 m), rising.
def synthetic_gpx(n=40, ele0=1400.0, step=25.0, with_ele=True) -> str:
    pts = "\n".join(
        f'<trkpt lat="{46.0 + i * 0.0005:.6f}" lon="10.500000">'
        + (f"<ele>{ele0 + i * step:.0f}</ele>" if with_ele else "")
        + "</trkpt>"
        for i in range(n)
    )
    return (f'<?xml version="1.0"?><gpx version="1.1" creator="test" '
            f'xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>{pts}'
            f"</trkseg></trk></gpx>")


print("== parse ==")
raw = gpx.parse_gpx(synthetic_gpx())
check("parses namespaced GPX 1.1", len(raw) == 40)
check("elevation read", raw[0].ele == 1400.0 and raw[-1].ele == 1400.0 + 39 * 25)
rte = gpx.parse_gpx(synthetic_gpx().replace("trkpt", "rtept")
                    .replace("<trk><trkseg>", "<rte>").replace("</trkseg></trk>", "</rte>"))
check("rtept fallback", len(rte) == 40)
no_ele = gpx.parse_gpx(synthetic_gpx(with_ele=False))
check("missing <ele> → None, not invented", all(p.ele is None for p in no_ele))
for bad, label in [("<gpx><trk>", "malformed XML"),
                   (synthetic_gpx(n=1), "single point"),
                   ('<gpx><trk><trkseg><trkpt lat="99" lon="10"/>'
                    '<trkpt lat="46" lon="10"/></trkseg></trk></gpx>', "lat out of range")]:
    try:
        gpx.parse_gpx(bad)
        check(f"rejects {label}", False)
    except gpx.GpxError:
        check(f"rejects {label}", True)

print("== geometry ==")
d = gpx.haversine_m(gpx.TrackPoint(46.0, 10.5), gpx.TrackPoint(47.0, 10.5))
check("haversine ~111 km per degree lat", abs(d - 111_195) < 500, f"{d:.0f}")

print("== decimate (selection, never fabrication) ==")
dec = gpx.decimate(raw, spacing_m=100)
check("fewer points after decimation", 2 < len(dec) < len(raw))
check("first and last kept", dec[0] == raw[0] and dec[-1] == raw[-1])
check("every output point exists in the input", all(p in raw for p in dec))
gaps = [gpx.haversine_m(a, b) for a, b in zip(dec, dec[1:-1])]
check("spacing respected (>=100 m between kept points)",
      all(g >= 100 for g in gaps), str([f"{g:.0f}" for g in gaps[:3]]))

print("== stats ==")
st = gpx.track_stats(raw)
check("length ≈ 39 * 55.6 m", abs(st.length_m - 39 * 55.6) < 100, f"{st.length_m:.0f}")
check("highest = last (monotone climb)", st.highest == raw[-1])
check("vertical gain = 39*25", st.vertical_gain_m == 39 * 25.0)
st2 = gpx.track_stats(no_ele)
check("no elevations → gain/highest None, not invented",
      st2.highest is None and st2.vertical_gain_m is None)

print("== ingest script: sanity gate + seed write ==")
spec = importlib.util.spec_from_file_location(
    "ingest_gpx", pathlib.Path(__file__).resolve().parents[1] / "scripts" / "ingest_gpx.py")
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

route = {"slug": "test-route", "start_altitude_m": 1400, "max_altitude_m": 2375}
check("matching GPX passes the gate",
      ing.sanity_check(route, gpx.track_stats(raw), force=False) == [])
wrong = {"slug": "test-route", "start_altitude_m": 2800, "max_altitude_m": 3900}
check("wrong-file GPX is refused",
      len(ing.sanity_check(wrong, gpx.track_stats(raw), force=False)) == 2)
check("--force overrides (curator's call)",
      ing.sanity_check(wrong, gpx.track_stats(raw), force=True) == [])
check("GPX without elevations is flagged",
      any("<ele>" in p for p in ing.sanity_check(route, st2, force=False)))

with tempfile.TemporaryDirectory() as td:
    seed = pathlib.Path(td) / "seed_routes.json"
    seed.write_text(json.dumps({"areas": [], "routes": [dict(route, name="T",
        activity="scialpinismo", primary_aspects=["N"])]}), encoding="utf-8")
    with patch.object(ing, "SEED", seed):
        ing.ingest_memory("test-route", gpx.decimate(raw, 100), gpx.track_stats(raw))
    out = json.loads(seed.read_text(encoding="utf-8"))["routes"][0]
    check("seed gains start_lat/start_lon (verbatim first point)",
          out["start_lat"] == raw[0].lat and out["start_lon"] == raw[0].lon)
    check("seed gains track_points with ele",
          len(out["track_points"]) > 2 and out["track_points"][0]["ele"] == 1400.0)

print("== unlock: planner uses live forecast for routes with coordinates ==")
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import store  # noqa: E402
from app.models import Bulletin, PointForecast  # noqa: E402
from app.providers import google_weather  # noqa: E402

client = TestClient(app)
NOW = datetime(2026, 2, 10, 8, 0, tzinfo=timezone.utc)
BULLETIN = Bulletin(avalanche_service="AINEVA", avalanche_zone="IT-25",
                    issued_at=NOW - timedelta(hours=10), danger_level=2,
                    danger_by_aspect={"N": 2, "NE": 2}, raw_text="t",
                    source_url="https://example.org/b")
LIVE_FC = PointForecast(lat=46.0, lon=10.5, valid_at=NOW, temp_c=-3.0,
                        freezing_level_m=1538, wind_avg_kmh=20, wind_gust_kmh=45,
                        precip_mm=0.0, thunderstorm_prob=0.05,
                        source="google-maps-weather · derived")

ingested = [dict(store.get_route("scialpinismo-monte-vioz-da-pejo"),
                 start_lat=46.0, start_lon=10.5)]
fetches: list[tuple] = []
def fake_fetch(lat, lon, altitude_m=0, **kw):
    fetches.append((lat, lon, altitude_m))
    return LIVE_FC, 1.0
with patch("app.services.planner.store.list_routes", return_value=ingested), \
     patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=2), \
     patch.object(google_weather, "is_configured", return_value=True), \
     patch.object(google_weather, "fetch_point", side_effect=fake_fetch):
    g.return_value.fetch.return_value = BULLETIN
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "vioz", "activity": "scialpinismo"})
body = r.json()
check("plan 200", r.status_code == 200, r.text)
check("live forecast fetched at the route's real coords + start altitude",
      fetches == [(46.0, 10.5, ingested[0]["start_altitude_m"])], str(fetches))
check("mock-forecast notice GONE for ingested routes", body["forecast_notice"] is None)

print("== fail-safe: live fetch failure → disclosed mock, never silent ==")
def boom(*a, **kw):
    raise google_weather.ForecastFetchError("down")
with patch("app.services.planner.store.list_routes", return_value=ingested), \
     patch("app.services.planner.registry.get_for_country") as g, \
     patch("app.services.planner._now_month", return_value=2), \
     patch.object(google_weather, "is_configured", return_value=True), \
     patch.object(google_weather, "fetch_point", side_effect=boom):
    g.return_value.fetch.return_value = BULLETIN
    g.return_value.service = "AINEVA"
    r = client.post("/planner/plan", json={"intent_text": "vioz", "activity": "scialpinismo"})
check("notice returns when live fetch fails", r.json()["forecast_notice"] is not None)

print("\nALL GPX CHECKS PASSED")
