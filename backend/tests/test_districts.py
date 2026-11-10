import re
from pathlib import Path

from app.districts import district_ids, find_district, load_districts, point_in_ring

ROOT = Path(__file__).resolve().parents[2]


def test_ten_districts_with_closed_rings():
    ds = load_districts()
    assert len(ds) == 10
    for d in ds:
        assert d.ring[0] == d.ring[-1], d.id


def test_ids_match_frontend():
    """Бекенд і фронтенд мають однакові id районів — інакше дані не потраплять на карту."""
    js = (ROOT / "frontend" / "js" / "districts.js").read_text(encoding="utf-8")
    front = re.findall(r"\{ id: '([a-z]+)', name:", js)
    assert sorted(front) == sorted(district_ids())


def test_point_in_ring_square():
    sq = ((0, 0), (1, 0), (1, 1), (0, 1), (0, 0))
    assert point_in_ring(0.5, 0.5, sq)
    assert not point_in_ring(1.5, 0.5, sq)


def test_known_places():
    assert find_district(50.427, 30.540) == "pecherskyi"       # Печерськ
    assert find_district(50.400, 30.700) == "darnytskyi"       # Позняки
    assert find_district(50.52, 30.47) == "obolonskyi"         # Оболонь
    assert find_district(50.30, 30.52) == "holosiivskyi"       # південь міста


def test_outside_city():
    assert find_district(49.84, 24.03) is None   # Львів
    assert find_district(50.45, 30.0) is None    # далеко на захід від Києва


def test_snap_near_border():
    # точка на Дніпрі між Печерським і Дніпровським — відносимо до найближчого району
    assert find_district(50.44, 30.565) in {"pecherskyi", "dniprovskyi", "darnytskyi"}
