"""Джерело даних: Sensor.Community (колишній luftdaten.info) — відкрита мережа датчиків, без API-ключа.

Документація: https://github.com/opendata-stuttgart/meta/wiki/EN-APIs
Ендпоінт повертає останні вимірювання (≈5 хв) усіх датчиків у колі навколо точки.
P1 — PM10, P2 — PM2.5 (мкг/м³). Час — UTC, формат 'YYYY-MM-DD HH:MM:SS'.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from ..config import settings
from .base import Reading

SOURCE = "sensor.community"
URL = "https://data.sensor.community/airrohr/v1/filter/area={lat},{lon},{radius}"

# Межі правдоподібних значень; поза ними — збій датчика
PM25_RANGE = (0.0, 1000.0)
PM10_RANGE = (0.0, 2000.0)


def _num(value, lo, hi) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if lo <= v <= hi else None


def _ts(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def parse(payload) -> list[Reading]:
    """Перетворює відповідь API на список Reading. Записи без PM або з битими полями відкидаються."""
    readings: list[Reading] = []
    if not isinstance(payload, list):
        return readings
    for rec in payload:
        try:
            values = {v["value_type"]: v["value"] for v in rec.get("sensordatavalues", [])}
            if "P1" not in values and "P2" not in values:
                continue  # датчик температури/вологості тощо
            lat = float(rec["location"]["latitude"])
            lon = float(rec["location"]["longitude"])
            ts = _ts(rec.get("timestamp"))
            sensor_id = rec["sensor"]["id"]
        except (KeyError, TypeError, ValueError):
            continue
        pm25 = _num(values.get("P2"), *PM25_RANGE)
        pm10 = _num(values.get("P1"), *PM10_RANGE)
        if ts is None or (pm25 is None and pm10 is None):
            continue
        readings.append(Reading(
            sensor_key=f"sc:{sensor_id}",
            source=SOURCE,
            lat=lat,
            lon=lon,
            sensor_type=(rec["sensor"].get("sensor_type") or {}).get("name"),
            ts=ts,
            pm25=pm25,
            pm10=pm10,
        ))
    return readings


async def fetch(client: httpx.AsyncClient | None = None) -> list[Reading]:
    url = URL.format(lat=settings.area_lat, lon=settings.area_lon, radius=settings.area_radius_km)
    own = client is None
    client = client or httpx.AsyncClient(timeout=settings.http_timeout_s, headers={"User-Agent": "KyivAir/0.1 (student project)"})
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        return parse(resp.json())
    finally:
        if own:
            await client.aclose()
