"""Tests for scripts/build_data.py using a small synthetic workbook.

The numbers below are made up for testing only; they are not MCERT data.
Run with: python -m unittest discover tests
"""

import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_data  # noqa: E402


def make_workbook(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "By council"
    ws.append(["Synthetic dog control statistics"])
    ws.append([])
    ws.append(["Territorial authority", "Region", "Dogs", "Owners", "Menacing"])
    ws.append(["Alpha District", "North", 1000, "400", 3])
    ws.append(["Beta City", "South", 2500.0, 900, None])
    ws.append(["Total", None, 3500, 1300, 3])
    ws.append(["Note: synthetic data"])
    wb.create_sheet("Empty")
    wb.save(path)


class BuildDataTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raw = Path(self.tmp.name)
        make_workbook(self.raw / "stats.xlsx")
        self.result = build_data.build(self.raw)

    def tearDown(self):
        self.tmp.cleanup()

    def test_one_dataset_per_data_sheet(self):
        self.assertEqual(self.result["files"], ["stats.xlsx"])
        self.assertEqual([d["sheet"] for d in self.result["datasets"]], ["By council"])

    def test_columns_classified(self):
        ds = self.result["datasets"][0]
        self.assertEqual(ds["label"], "Territorial authority")
        self.assertEqual(ds["dimensions"], ["Territorial authority", "Region"])
        self.assertEqual(ds["measures"], ["Dogs", "Owners", "Menacing"])

    def test_rows_notes_and_totals(self):
        ds = self.result["datasets"][0]
        self.assertEqual(ds["notes"], ["Synthetic dog control statistics"])
        self.assertEqual(ds["footnotes"], ["Note: synthetic data"])
        self.assertEqual(len(ds["rows"]), 3)
        self.assertEqual(ds["rows"][0]["Owners"], 400)  # numeric text parsed
        self.assertEqual(ds["rows"][1]["Dogs"], 2500)  # whole floats become ints
        self.assertEqual([r["_total"] for r in ds["rows"]], [False, False, True])

    def test_empty_raw_dir(self):
        with tempfile.TemporaryDirectory() as empty:
            self.assertEqual(build_data.build(Path(empty))["datasets"], [])


if __name__ == "__main__":
    unittest.main()
