import asyncio
import json
from datetime import datetime, timezone

from app import collector
from app.aggregate import district_window
from app.sources import sensor_community
from conftest import FIXTURES

NOW = datetime(2026, 11, 10, 10, 30, tzinfo=timezone.utc)


def sample():
    return json.loads((FIXTURES / "sensor_community_sample.json").read_text(encoding="utf-8"))


def test_parse_keeps_only_valid_pm_records():
    readings = sensor_community.parse(sample())
    keys = sorted(r.sensor_key for r in readings)
    # BME280 (без PM), запис з від'ємним/текстовим значенням, з битою датою і зламаний запис — відкинуті
    assert keys == ["sc:7001", "sc:7002", "sc:7003", "sc:7005"]
    r = next(r for r in readings if r.sensor_key == "sc:7001")
    assert (r.pm25, r.pm10, r.sensor_type) == (22.1, 41.3, "SDS011")
    assert r.ts == datetime(2026, 11, 10, 10, 5, tzinfo=timezone.utc)


def test_parse_non_list():
    assert sensor_community.parse({"error": "x"}) == []


def test_store_assigns_districts_and_skips_duplicates(conn):
    readings = sensor_community.parse(sample())
    assert collector.store_readings(conn, readings) == 4
    assert collector.store_readings(conn, readings) == 0  # повторний запуск не дублює
    districts = dict(conn.execute("SELECT id, district_id FROM sensors").fetchall())
    assert districts["sc:7001"] == "pecherskyi"
    assert districts["sc:7003"] == "darnytskyi"
    assert districts["sc:7005"] is None  # Львів — поза містом


def test_district_aggregation_median_and_aqi(conn):
    collector.store_readings(conn, sensor_community.parse(sample()))
    data = district_window(conn, datetime(2026, 11, 10, 10, tzinfo=timezone.utc), NOW)
    p = data["pecherskyi"]
    assert p["sensorsCount"] == 2
    assert p["pm25"] == 26.1          # медіана двох датчиків: (22.1 + 30.0) / 2 = 26.05 → 26.1
    assert p["aqi"] == 83             # AQI(PM2.5 = 26.1) = 83 > AQI(PM10 = 45.7) = 42
    assert p["dominantPollutant"] == "pm25"
    assert p["updatedAt"] == "2026-11-10T10:06:00Z"
    assert data["obolonskyi"]["aqi"] is None and data["obolonskyi"]["sensorsCount"] == 0
    assert len(data) == 10


def test_collect_once_survives_source_failure(conn, monkeypatch):
    async def boom():
        raise RuntimeError("мережа недоступна")
    monkeypatch.setattr(sensor_community, "fetch", boom)
    stats = asyncio.run(collector.collect_once(conn, NOW))
    assert stats == {"sensor.community": -1}
    row = conn.execute("SELECT ok, error FROM collection_log").fetchone()
    assert row["ok"] == 0 and "мережа" in row["error"]


def test_collect_once_writes_hourly(conn, monkeypatch):
    async def fake():
        return sensor_community.parse(sample())
    monkeypatch.setattr(sensor_community, "fetch", fake)
    asyncio.run(collector.collect_once(conn, NOW))
    row = conn.execute("SELECT aqi, sensors_count FROM district_hourly WHERE district_id='darnytskyi' AND hour='2026-11-10T10:00:00Z'").fetchone()
    assert row["aqi"] == 154 and row["sensors_count"] == 1   # PM2.5 = 60 → 154
