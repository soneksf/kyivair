"""Налаштування через змінні середовища (див. .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # корінь репозиторію


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    db_path: str = field(default_factory=lambda: os.getenv("KYIVAIR_DB", str(ROOT / "backend" / "data" / "kyivair.db")))
    districts_file: str = field(default_factory=lambda: os.getenv("KYIVAIR_DISTRICTS", str(ROOT / "shared" / "districts.geojson")))
    frontend_dir: str = field(default_factory=lambda: os.getenv("KYIVAIR_FRONTEND", str(ROOT / "frontend")))
    # Збір даних
    collect_enabled: bool = field(default_factory=lambda: _bool("KYIVAIR_COLLECT", True))
    collect_interval_min: int = field(default_factory=lambda: int(os.getenv("KYIVAIR_COLLECT_INTERVAL_MIN", "10")))
    # Центр Києва і радіус пошуку датчиків, км
    area_lat: float = 50.45
    area_lon: float = 30.52
    area_radius_km: int = 25
    # Вікно усереднення для «поточного» AQI, хв
    current_window_min: int = 60
    # Скільки зберігати сирі вимірювання, днів
    raw_retention_days: int = 3
    http_timeout_s: float = 30.0


settings = Settings()
