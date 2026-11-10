"""Збір даних: завантажує вимірювання, прив'язує датчики до районів, оновлює погодинні показники.

Разовий запуск:  python -m app.collector
"""
from __future__ import annotations

import asyncio
import logging
import sqlite3
from datetime import datetime, timedelta, timezone

from . import db
from .aggregate import hour_floor, iso, update_hourly
from .config import settings
from .districts import find_district
from .sources import SOURCES
from .sources.base import Reading

log = logging.getLogger("kyivair.collector")


def store_readings(conn: sqlite3.Connection, readings: list[Reading]) -> int:
    """Зберігає вимірювання; повертає кількість нових записів. Нові датчики отримують район за координатами."""
    known = {r["id"]: (r["lat"], r["lon"]) for r in conn.execute("SELECT id, lat, lon FROM sensors")}
    added = 0
    for r in readings:
        if known.get(r.sensor_key) != (r.lat, r.lon):  # новий датчик або його перенесли
            conn.execute(
                """INSERT INTO sensors (id, source, lat, lon, district_id, sensor_type, last_seen)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET lat=excluded.lat, lon=excluded.lon,
                       district_id=excluded.district_id, sensor_type=excluded.sensor_type""",
                (r.sensor_key, r.source, r.lat, r.lon, find_district(r.lat, r.lon), r.sensor_type, iso(r.ts)),
            )
            known[r.sensor_key] = (r.lat, r.lon)
        cur = conn.execute(
            "INSERT OR IGNORE INTO measurements (sensor_id, ts, pm25, pm10) VALUES (?, ?, ?, ?)",
            (r.sensor_key, iso(r.ts), r.pm25, r.pm10),
        )
        added += cur.rowcount
        conn.execute("UPDATE sensors SET last_seen = MAX(COALESCE(last_seen, ''), ?) WHERE id = ?", (iso(r.ts), r.sensor_key))
    return added


def refresh_aggregates(conn: sqlite3.Connection, readings: list[Reading], now: datetime) -> None:
    """Оновлює погодинні показники для всіх годин, у які потрапили нові вимірювання (і поточної)."""
    hours = {hour_floor(r.ts) for r in readings} | {hour_floor(now)}
    for h in sorted(hours):
        update_hourly(conn, h)


def prune(conn: sqlite3.Connection, now: datetime) -> None:
    cutoff = iso(now - timedelta(days=settings.raw_retention_days))
    conn.execute("DELETE FROM measurements WHERE ts < ?", (cutoff,))


async def collect_once(conn: sqlite3.Connection, now: datetime | None = None) -> dict[str, int]:
    """Один цикл збору з усіх джерел. Помилка одного джерела не зупиняє інші."""
    now = now or datetime.now(timezone.utc)
    stats = {}
    for name, source in SOURCES.items():
        try:
            readings = await source.fetch()
        except Exception as e:  # мережа, 5xx, некоректний JSON
            log.warning("Джерело %s недоступне: %s", name, e)
            conn.execute("INSERT INTO collection_log (started_at, source, ok, error) VALUES (?, ?, 0, ?)", (iso(now), name, str(e)[:500]))
            conn.commit()
            stats[name] = -1
            continue
        with db.transaction(conn):
            added = store_readings(conn, readings)
            refresh_aggregates(conn, readings, now)
            prune(conn, now)
            conn.execute("INSERT INTO collection_log (started_at, source, ok, records) VALUES (?, ?, 1, ?)", (iso(now), name, added))
        log.info("%s: отримано %d записів, нових %d", name, len(readings), added)
        stats[name] = added
    return stats


async def run_forever(conn: sqlite3.Connection) -> None:
    while True:
        try:
            await collect_once(conn)
        except Exception:
            log.exception("Помилка циклу збору")
        await asyncio.sleep(settings.collect_interval_min * 60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(asyncio.run(collect_once(db.connect())))
