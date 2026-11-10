"""KyivAir — REST API + роздача фронтенду.

Запуск:  uvicorn app.main:app --reload   (з папки backend)
Документація API: http://localhost:8000/docs
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db
from .aggregate import district_window, hour_floor, iso
from .collector import run_forever
from .config import settings
from .districts import district_ids, load_districts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MAX_HISTORY_DAYS = 31


class DistrictCurrent(BaseModel):
    id: str
    aqi: int | None
    pm25: float | None
    pm10: float | None
    dominantPollutant: str | None
    sensorsCount: int
    updatedAt: str | None


class HistoryPoint(BaseModel):
    ts: str
    aqi: int | None
    pm25: float | None
    pm10: float | None


class DistrictInfo(BaseModel):
    id: str
    name: str


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.conn = db.connect()
    task = asyncio.create_task(run_forever(app.state.conn)) if settings.collect_enabled else None
    yield
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    app.state.conn.close()


app = FastAPI(title="KyivAir API", version="0.1.0", lifespan=lifespan,
              description="Якість повітря (AQI) у районах Києва за даними відкритих датчиків.")


def _parse_dt(value: str | None, name: str) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, f"Параметр {name}: очікується дата ISO 8601, отримано '{value}'")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@app.get("/api/districts", response_model=list[DistrictInfo], tags=["districts"])
def list_districts():
    """Список 10 районів."""
    return [{"id": d.id, "name": d.name} for d in load_districts()]


@app.get("/api/districts/current", response_model=list[DistrictCurrent], tags=["districts"])
def current():
    """Поточний AQI кожного району — за вимірюваннями останньої години."""
    now = datetime.now(timezone.utc)
    data = district_window(app.state.conn, now - timedelta(minutes=settings.current_window_min), now + timedelta(seconds=1))
    return list(data.values())


@app.get("/api/districts/{district_id}/history", response_model=list[HistoryPoint], tags=["districts"])
def history(district_id: str,
            from_: str | None = Query(None, alias="from", description="Початок, ISO 8601 (за замовчуванням — 24 год тому)"),
            to: str | None = Query(None, description="Кінець, ISO 8601 (за замовчуванням — зараз)")):
    """Погодинна історія району. Години без даних повертаються з aqi = null."""
    if district_id not in district_ids():
        raise HTTPException(404, f"Район '{district_id}' не знайдено")
    end = _parse_dt(to, "to") or datetime.now(timezone.utc)
    start = _parse_dt(from_, "from") or end - timedelta(hours=24)
    if start >= end:
        raise HTTPException(422, "'from' має бути раніше за 'to'")
    if end - start > timedelta(days=MAX_HISTORY_DAYS):
        raise HTTPException(422, f"Період не може перевищувати {MAX_HISTORY_DAYS} днів")

    first, last = hour_floor(start), hour_floor(end)
    rows = app.state.conn.execute(
        "SELECT hour, aqi, pm25, pm10 FROM district_hourly WHERE district_id = ? AND hour >= ? AND hour <= ?",
        (district_id, iso(first), iso(last)),
    ).fetchall()
    by_hour = {r["hour"]: r for r in rows}
    points, h = [], first
    while h <= last:
        r = by_hour.get(iso(h))
        points.append({"ts": iso(h), "aqi": r["aqi"] if r else None,
                       "pm25": r["pm25"] if r else None, "pm10": r["pm10"] if r else None})
        h += timedelta(hours=1)
    return points


@app.get("/api/health", tags=["service"])
def health():
    """Стан сервісу: останній збір даних і кількість датчиків."""
    conn = app.state.conn
    last = conn.execute("SELECT started_at, source, ok, records, error FROM collection_log ORDER BY id DESC LIMIT 1").fetchone()
    sensors = conn.execute("SELECT COUNT(*) FROM sensors WHERE district_id IS NOT NULL").fetchone()[0]
    return {"status": "ok", "sensorsInCity": sensors, "lastCollection": dict(last) if last else None}


# Фронтенд: index.html, css/, js/ — з однієї адреси з API, тож CORS не потрібен
if Path(settings.frontend_dir, "index.html").exists():
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/docs")
