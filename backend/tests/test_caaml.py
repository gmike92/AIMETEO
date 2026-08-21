"""
Parser tests for the AINEVA/EAWS CAAML connector. Offline — uses saved real fixtures.
Run: python -m pytest backend/tests/test_caaml.py  (or: python backend/tests/test_caaml.py)
"""
import json
import pathlib
import sys

# allow `import app...` when run directly
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.connectors.caaml import parse_caaml, DANGER_MAP  # noqa: E402

FIX = pathlib.Path(__file__).resolve().parents[1] / "app" / "connectors" / "fixtures"


def _load(name):
    with open(FIX / name, encoding="utf-8") as f:
        return json.load(f)


def test_real_lombardia_subzone_match():
    """IT-25-BG-02 is in the 2nd bulletin (considerable=3 later). Must resolve to that one."""
    data = _load("it-25_2024-02-15.json")
    b = parse_caaml(data, region="IT-25", subzone="IT-25-BG-02",
                    source_url="http://x", country="IT", service="AINEVA")
    assert b is not None
    assert b.danger_level == 3                      # 'considerable'
    assert b.avalanche_service == "AINEVA"
    assert b.country == "IT"
    assert "wind_slab" in b.problem_types and "wet_snow" in b.problem_types
    # Problem aspects get the overall danger; verify a problem aspect is elevated.
    assert b.danger_by_aspect["N"] == 3
    assert b.raw_text and b.source_url == "http://x"
    print("OK real IT-25-BG-02 -> danger", b.danger_level, "| problems", b.problem_types)


def test_unknown_subzone_falls_back_to_max():
    """Unknown subzone -> most dangerous bulletin in the file (considerable=3)."""
    data = _load("it-25_2024-02-15.json")
    b = parse_caaml(data, region="IT-25", subzone="IT-99-XX-99", source_url="http://x")
    assert b is not None and b.danger_level == 3
    print("OK unknown subzone fallback -> danger", b.danger_level)


def test_danger_map_is_eaws():
    assert DANGER_MAP == {"low": 1, "moderate": 2, "considerable": 3, "high": 4, "very_high": 5}


def test_high_danger_blocks_aspects():
    """Synthetic high(4) bulletin: problem aspects must report 4 (so safety filter blocks)."""
    data = {"bulletins": [{
        "dangerRatings": [{"mainValue": "high"}, {"mainValue": "moderate"}],
        "avalancheProblems": [{"problemType": "persistent_weak_layers", "aspects": ["N", "NE", "NW"]}],
        "avalancheActivity": {"highlights": "Forte pericolo.", "comment": "Test."},
        "regions": [{"regionID": "IT-32-TN-08"}],
        "publicationTime": "2026-02-01T16:00:00+00:00",
        "validTime": {"endTime": "2026-02-02T23:00:00+00:00"},
        "source": {"provider": {"name": "AINEVA"}},
        "lang": "it",
    }]}
    b = parse_caaml(data, region="IT-32-TN", subzone="IT-32-TN-08", source_url="http://x")
    assert b.danger_level == 4
    assert b.danger_by_aspect["N"] == 4 and b.danger_by_aspect["NE"] == 4
    assert b.danger_by_aspect["S"] == 2  # baseline (moderate), not a problem aspect
    print("OK synthetic high -> N/NE=4, S=2 (baseline)")


def test_off_season_returns_none():
    assert parse_caaml({"bulletins": []}, region="IT-25", subzone=None, source_url="http://x") is None
    # bulletin with no danger rating -> None
    empty = {"bulletins": [{"dangerRatings": [], "regions": [{"regionID": "IT-25-BG-02"}]}]}
    assert parse_caaml(empty, region="IT-25", subzone="IT-25-BG-02", source_url="http://x") is None
    print("OK off-season / no-rating -> None")


if __name__ == "__main__":
    test_real_lombardia_subzone_match()
    test_unknown_subzone_falls_back_to_max()
    test_danger_map_is_eaws()
    test_high_danger_blocks_aspects()
    test_off_season_returns_none()
    print("\nALL CAAML PARSER TESTS PASSED")
