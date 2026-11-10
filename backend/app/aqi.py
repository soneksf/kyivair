"""Розрахунок AQI за шкалою US EPA (редакція 2024 року) для PM2.5 і PM10.

AQI = (I_hi - I_lo) / (C_hi - C_lo) * (C - C_lo) + I_lo,
де C — концентрація (мкг/м³), [C_lo, C_hi] — інтервал, у який вона потрапляє,
[I_lo, I_hi] — відповідний інтервал індексу.
"""
from __future__ import annotations

import math

# (C_lo, C_hi, I_lo, I_hi)
PM25_BREAKPOINTS = [
    (0.0, 9.0, 0, 50),
    (9.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 125.4, 151, 200),
    (125.5, 225.4, 201, 300),
    (225.5, 325.4, 301, 500),
]
PM10_BREAKPOINTS = [
    (0, 54, 0, 50),
    (55, 154, 51, 100),
    (155, 254, 101, 150),
    (255, 354, 151, 200),
    (355, 424, 201, 300),
    (425, 604, 301, 500),
]
BREAKPOINTS = {"pm25": (PM25_BREAKPOINTS, 1), "pm10": (PM10_BREAKPOINTS, 0)}


def _truncate(value: float, digits: int) -> float:
    """EPA вимагає відкидати (а не округлювати) зайві знаки: PM2.5 — до 0.1, PM10 — до цілого."""
    factor = 10 ** digits
    return math.floor(value * factor + 1e-9) / factor


def concentration_to_aqi(pollutant: str, concentration: float | None) -> int | None:
    """Перетворює концентрацію на AQI. None — якщо значення відсутнє або некоректне.

    Концентрації понад верхню межу шкали дають AQI 500.
    """
    if pollutant not in BREAKPOINTS:
        raise ValueError(f"Невідомий забруднювач: {pollutant}")
    if concentration is None or not math.isfinite(concentration) or concentration < 0:
        return None
    table, digits = BREAKPOINTS[pollutant]
    c = _truncate(concentration, digits)
    for c_lo, c_hi, i_lo, i_hi in table:
        if c <= c_hi:
            return round((i_hi - i_lo) / (c_hi - c_lo) * (c - c_lo) + i_lo)
    return 500


def overall_aqi(pm25: float | None, pm10: float | None) -> tuple[int | None, str | None]:
    """Загальний AQI = максимум серед забруднювачів. Повертає (aqi, основний забруднювач)."""
    candidates = [
        (aqi, name)
        for name, value in (("pm25", pm25), ("pm10", pm10))
        if (aqi := concentration_to_aqi(name, value)) is not None
    ]
    if not candidates:
        return None, None
    return max(candidates)
