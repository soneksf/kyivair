import os
import sys
import tempfile
from pathlib import Path

# Налаштування до імпорту застосунку: окрема тимчасова БД, без фонового збору
_tmp = tempfile.mkdtemp()
os.environ["KYIVAIR_DB"] = str(Path(_tmp) / "test.db")
os.environ["KYIVAIR_COLLECT"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import db  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def conn():
    c = db.connect(":memory:")
    yield c
    c.close()
