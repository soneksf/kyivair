from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Reading:
    """Одне вимірювання одного датчика — спільний формат для всіх джерел даних."""
    sensor_key: str        # унікальний id: '<префікс джерела>:<id датчика>'
    source: str
    lat: float
    lon: float
    sensor_type: str | None
    ts: datetime           # UTC
    pm25: float | None     # мкг/м³
    pm10: float | None     # мкг/м³
