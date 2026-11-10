"""Наповнює базу правдоподібними демо-даними за останні 7 днів — для показу без інтернету.

Запуск:  python -m app.demo            (додає 30 демо-датчиків і вимірювання раз на 10 хв)
         python -m app.demo --clear    (видаляє демо-дані)
Демо-датчики мають id 'demo:*', тож їх легко відрізнити від справжніх.
"""
from __future__ import annotations

import argparse
import math
import random
from datetime import datetime, timedelta, timezone

from . import db
from .aggregate import hour_floor, update_hourly
from .collector import store_readings
from .districts import load_districts
from .sources.base import Reading

# Типовий рівень PM2.5 (мкг/м³) у районі: лівий берег і промзони — вищий
BASE_PM25 = {
    "obolonskyi": 8, "podilskyi": 13, "sviatoshynskyi": 10, "shevchenkivskyi": 15, "pecherskyi": 14,
    "solomianskyi": 17, "holosiivskyi": 7, "desnianskyi": 12, "dniprovskyi": 20, "darnytskyi": 30,
}


def _inside_point(ring, rnd):
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    from .districts import point_in_ring
    while True:
        lon, lat = rnd.uniform(min(xs), max(xs)), rnd.uniform(min(ys), max(ys))
        if point_in_ring(lon, lat, ring):
            return lat, lon


def generate(days: int = 7, step_min: int = 10, now: datetime | None = None, seed: int = 42) -> list[Reading]:
    rnd = random.Random(seed)
    now = now or datetime.now(timezone.utc)
    sensors = []
    for d in load_districts():
        for i in range(3):
            lat, lon = _inside_point(d.ring, rnd)
            sensors.append((f"demo:{d.id}-{i}", d.id, lat, lon, rnd.uniform(0.85, 1.15)))
    readings = []
    t = now - timedelta(days=days)
    while t <= now:
        local_h = (t.hour + 2) % 24  # приблизно київський час
        rush = math.exp(-((local_h - 8.5) ** 2) / 4) + math.exp(-((local_h - 19) ** 2) / 5)
        weather = 1 + 0.4 * math.sin(t.timestamp() / 86400 / 1.7)  # повільні «погодні» коливання
        for key, did, lat, lon, k in sensors:
            pm25 = max(1.0, BASE_PM25[did] * k * weather * (0.75 + 0.5 * rush) + rnd.gauss(0, 2))
            readings.append(Reading(key, "demo", lat, lon, "SDS011", t, round(pm25, 1), round(pm25 * rnd.uniform(1.4, 1.9), 1)))
        t += timedelta(minutes=step_min)
    return readings


def seed(conn, days: int = 7) -> int:
    readings = generate(days)
    with db.transaction(conn):
        added = store_readings(conn, readings)
        for h in sorted({hour_floor(r.ts) for r in readings}):
            update_hourly(conn, h)
    return added


def clear(conn) -> None:
    with db.transaction(conn):
        conn.execute("DELETE FROM measurements WHERE sensor_id LIKE 'demo:%'")
        conn.execute("DELETE FROM sensors WHERE id LIKE 'demo:%'")
        hours = [r[0] for r in conn.execute("SELECT DISTINCT hour FROM district_hourly")]
        for h in hours:
            update_hourly(conn, datetime.fromisoformat(h.replace("Z", "+00:00")))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--clear", action="store_true")
    p.add_argument("--days", type=int, default=7)
    a = p.parse_args()
    conn = db.connect()
    if a.clear:
        clear(conn)
        print("Демо-дані видалено")
    else:
        print(f"Додано {seed(conn, a.days)} демо-вимірювань")
