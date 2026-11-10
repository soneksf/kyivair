from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import demo
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        demo.seed(app.state.conn, days=2)
        yield c


def test_current_returns_all_districts(client):
    r = client.get("/api/districts/current")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 10
    for d in data:
        assert set(d) == {"id", "aqi", "pm25", "pm10", "dominantPollutant", "sensorsCount", "updatedAt"}
        assert d["aqi"] is not None and 0 <= d["aqi"] <= 500
        assert d["sensorsCount"] == 3


def test_history_default_24h_hourly(client):
    data = client.get("/api/districts/pecherskyi/history").json()
    assert 24 <= len(data) <= 25
    ts = [datetime.fromisoformat(p["ts"].replace("Z", "+00:00")) for p in data]
    assert all(b - a == timedelta(hours=1) for a, b in zip(ts, ts[1:]))


def test_history_fills_gaps_with_null(client):
    end = datetime.now(timezone.utc) - timedelta(days=10)
    data = client.get("/api/districts/pecherskyi/history",
                      params={"from": (end - timedelta(hours=5)).isoformat(), "to": end.isoformat()}).json()
    assert data and all(p["aqi"] is None for p in data)


def test_history_unknown_district(client):
    assert client.get("/api/districts/lviv/history").status_code == 404


@pytest.mark.parametrize("params", [
    {"from": "вчора"},
    {"from": "2026-11-10T10:00:00Z", "to": "2026-11-10T09:00:00Z"},
    {"from": "2026-01-01T00:00:00Z", "to": "2026-11-10T00:00:00Z"},
])
def test_history_bad_params(client, params):
    assert client.get("/api/districts/pecherskyi/history", params=params).status_code == 422


def test_districts_list_and_health(client):
    names = {d["id"]: d["name"] for d in client.get("/api/districts").json()}
    assert names["pecherskyi"] == "Печерський"
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["sensorsInCity"] == 30


def test_frontend_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "KyivAir" in r.text
