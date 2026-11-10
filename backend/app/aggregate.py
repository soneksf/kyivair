"""Агрегація вимірювань датчиків у показники районів.

1. Для кожного датчика — середнє PM2.5 і PM10 у часовому вікні.
2. Для району — медіана по датчиках (стійка до одного «збожеволілого» датчика).
3. AQI району — максимум з AQI за PM2.5 і PM10 (основний забруднювач — той, що дав максимум).
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from statistics import median

from .aqi import overall_aqi
from .districts import district_ids


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hour_floor(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def district_window(conn: sqlite3.Connection, start: datetime, end: datetime) -> dict[str, dict]:
    """Показники всіх районів за вимірюваннями в [start, end). Райони без даних мають aqi=None."""
    rows = conn.execute(
        """
        SELECT s.district_id, m.sensor_id,
               AVG(m.pm25) AS pm25, AVG(m.pm10) AS pm10, MAX(m.ts) AS last_ts
        FROM measurements m JOIN sensors s ON s.id = m.sensor_id
        WHERE m.ts >= ? AND m.ts < ? AND s.district_id IS NOT NULL
        GROUP BY s.district_id, m.sensor_id
        """,
        (iso(start), iso(end)),
    ).fetchall()

    per_district: dict[str, list[sqlite3.Row]] = {}
    for r in rows:
        per_district.setdefault(r["district_id"], []).append(r)

    result = {}
    for did in district_ids():
        sensors = per_district.get(did, [])
        pm25_vals = [r["pm25"] for r in sensors if r["pm25"] is not None]
        pm10_vals = [r["pm10"] for r in sensors if r["pm10"] is not None]
        pm25 = round(median(pm25_vals), 1) if pm25_vals else None
        pm10 = round(median(pm10_vals), 1) if pm10_vals else None
        aqi, dominant = overall_aqi(pm25, pm10)
        result[did] = {
            "id": did,
            "aqi": aqi,
            "pm25": pm25,
            "pm10": pm10,
            "dominantPollutant": dominant,
            "sensorsCount": len(sensors),
            "updatedAt": max((r["last_ts"] for r in sensors), default=None),
        }
    return result


def update_hourly(conn: sqlite3.Connection, hour: datetime) -> None:
    """Перераховує й зберігає погодинні показники районів для години, що починається з `hour`."""
    start = hour_floor(hour)
    data = district_window(conn, start, start + timedelta(hours=1))
    conn.executemany(
        """
        INSERT INTO district_hourly (district_id, hour, aqi, pm25, pm10, dominant, sensors_count)
        VALUES (:id, :hour, :aqi, :pm25, :pm10, :dominantPollutant, :sensorsCount)
        ON CONFLICT(district_id, hour) DO UPDATE SET
            aqi = excluded.aqi, pm25 = excluded.pm25, pm10 = excluded.pm10,
            dominant = excluded.dominant, sensors_count = excluded.sensors_count
        """,
        [{**d, "hour": iso(start)} for d in data.values()],
    )
