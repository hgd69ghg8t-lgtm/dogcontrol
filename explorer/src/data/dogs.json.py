# Framework data loader: the same JSON the dashboard uses, built from the
# MCERT workbook by scripts/build_data.py.
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
from build_data import build, newest_workbook  # noqa: E402

workbook = newest_workbook(ROOT / "data" / "raw")
if workbook is None:
    sys.exit("No .xlsx in data/raw/; download the MCERT workbook first.")
json.dump(build(workbook), sys.stdout, separators=(",", ":"), ensure_ascii=False)
