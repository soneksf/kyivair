import math

import pytest

from app.aqi import concentration_to_aqi, overall_aqi


@pytest.mark.parametrize("c, expected", [
    (0.0, 0), (9.0, 50), (9.1, 51), (12.0, 56), (35.4, 100), (35.5, 101),
    (55.4, 150), (55.5, 151), (125.4, 200), (125.5, 201), (225.4, 300), (225.5, 301), (325.4, 500),
])
def test_pm25_breakpoints(c, expected):
    assert concentration_to_aqi("pm25", c) == expected


@pytest.mark.parametrize("c, expected", [(0, 0), (54, 50), (55, 51), (154, 100), (155, 101), (354, 200), (604, 500)])
def test_pm10_breakpoints(c, expected):
    assert concentration_to_aqi("pm10", c) == expected


def test_truncation_not_rounding():
    # 9.05 обрізається до 9.0 → 50, а не округлюється до 9.1 → 51
    assert concentration_to_aqi("pm25", 9.05) == 50
    assert concentration_to_aqi("pm10", 54.9) == 50


def test_above_scale_is_500():
    assert concentration_to_aqi("pm25", 900) == 500


@pytest.mark.parametrize("bad", [None, -1, math.nan, math.inf])
def test_invalid_values(bad):
    assert concentration_to_aqi("pm25", bad) is None


def test_unknown_pollutant():
    with pytest.raises(ValueError):
        concentration_to_aqi("co2", 10)


def test_overall_takes_max_and_dominant():
    assert overall_aqi(12.0, 200) == (123, "pm10")
    assert overall_aqi(40.0, 30) == (112, "pm25")
    assert overall_aqi(None, None) == (None, None)
    assert overall_aqi(None, 54) == (50, "pm10")
