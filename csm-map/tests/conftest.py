import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import pytest  # noqa: E402

from csmmap.regions import RegionIndex  # noqa: E402
from make_fixture import make  # noqa: E402


@pytest.fixture(scope="session")
def regions() -> RegionIndex:
    return RegionIndex.load()


@pytest.fixture
def folder(tmp_path: pathlib.Path) -> pathlib.Path:
    make(tmp_path / "CSM.xlsx")
    return tmp_path
