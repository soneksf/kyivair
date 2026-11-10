"""SQLite: схема і підключення."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS sensors (
    id          TEXT PRIMARY KEY,          -- 'sc:12345' (джерело:id)
    source      TEXT NOT NULL,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    district_id TEXT,                      -- NULL: датчик поза межами міста
    sensor_type TEXT,
    last_seen   TEXT
);
CREATE TABLE IF NOT EXISTS measurements (
    sensor_id TEXT NOT NULL REFERENCES sensors(id),
    ts        TEXT NOT NULL,               -- ISO 8601, UTC
    pm25      REAL,
    pm10      REAL,
    PRIMARY KEY (sensor_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_measurements_ts ON measurements(ts);
CREATE TABLE IF NOT EXISTS district_hourly (
    district_id   TEXT NOT NULL,
    hour          TEXT NOT NULL,           -- початок години, ISO 8601 UTC
    aqi           INTEGER,
    pm25          REAL,
    pm10          REAL,
    dominant      TEXT,
    sensors_count INTEGER NOT NULL,
    PRIMARY KEY (district_id, hour)
);
CREATE TABLE IF NOT EXISTS collection_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    source     TEXT NOT NULL,
    ok         INTEGER NOT NULL,
    records    INTEGER NOT NULL DEFAULT 0,
    error      TEXT
);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or settings.db_path
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
