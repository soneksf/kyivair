"""Райони Києва і прив'язка датчика до району за координатами."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache

from .config import settings

# Датчик поза всіма полігонами, але ближче за цю відстань до району, відносимо до нього
# (межі схематичні, між ними й уздовж Дніпра є проміжки).
SNAP_DISTANCE_KM = 2.0


@dataclass(frozen=True)
class District:
    id: str
    name: str
    ring: tuple[tuple[float, float], ...]  # (lon, lat), замкнений контур


@lru_cache
def load_districts() -> tuple[District, ...]:
    with open(settings.districts_file, encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for feat in data["features"]:
        ring = tuple(tuple(p) for p in feat["geometry"]["coordinates"][0])
        out.append(District(feat["properties"]["id"], feat["properties"]["name"], ring))
    return tuple(out)


def district_ids() -> list[str]:
    return [d.id for d in load_districts()]


def point_in_ring(lon: float, lat: float, ring) -> bool:
    """Алгоритм трасування променя (ray casting)."""
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > lat) != (y2 > lat):
            x_cross = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < x_cross:
                inside = not inside
    return inside


def _km(lon1, lat1, lon2, lat2) -> float:
    kx = 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110.57)


def _distance_to_ring_km(lon: float, lat: float, ring) -> float:
    best = math.inf
    kx = 111.32 * math.cos(math.radians(lat))
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        # проєкція точки на відрізок у локальних км-координатах
        ax, ay = (x1 - lon) * kx, (y1 - lat) * 110.57
        bx, by = (x2 - lon) * kx, (y2 - lat) * 110.57
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def find_district(lat: float, lon: float) -> str | None:
    """id району для координат або None, якщо точка поза містом."""
    districts = load_districts()
    for d in districts:
        if point_in_ring(lon, lat, d.ring):
            return d.id
    nearest = min(districts, key=lambda d: _distance_to_ring_km(lon, lat, d.ring))
    return nearest.id if _distance_to_ring_km(lon, lat, nearest.ring) <= SNAP_DISTANCE_KM else None
