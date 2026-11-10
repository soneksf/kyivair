"""Джерела даних. Щоб додати нове (наприклад, SaveEcoBot), створіть модуль з функціями
`parse(payload) -> list[Reading]` і `async fetch() -> list[Reading]` та додайте його в SOURCES."""
from . import sensor_community

SOURCES = {sensor_community.SOURCE: sensor_community}
