#!/usr/bin/env python3
"""Convert the MCERT dog control statistics workbook into JSON for the site.

Reads the "raw data" sheet of the newest .xlsx in data/raw/ (long format:
council, category, subcategory, item, financial year, value) and writes
site/data/dogs.json, a compact year-indexed structure the page charts from.

Usage:
    python scripts/build_data.py [--xlsx FILE] [--out site/data/dogs.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import warnings
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
SHEET = "raw data"
HEADER = ["Council name", "Dog control statistics category", "Subcategory",
          "Item", "FY ending 30 June", "Value"]
AGGREGATES = {"New Zealand": "national", "NZ excluding Auckland": "aggregate"}

# Item code -> metric. Registered-dog items (1001-1007) are read from the
# "A_Registered dogs (total)" category; the breed category reuses the codes.
METRICS = [
    # id, item code, label, group, source, unit, rate ("per1000" of registered
    # dogs, "pct" of registered dogs, or None)
    ("dogs", "1001", "Registered dogs", "Dogs", "DIA National Dog Database", "count", None),
    ("female", "1002", "Female dogs", "Dogs", "DIA National Dog Database", "count", "pct"),
    ("male", "1003", "Male dogs", "Dogs", "DIA National Dog Database", "count", "pct"),
    ("desexed", "1004", "De-sexed dogs", "Dogs", "DIA National Dog Database", "count", "pct"),
    ("microchipped", "1005", "Micro-chipped dogs", "Dogs", "DIA National Dog Database", "count", "pct"),
    ("menacing", "1006", "Dogs classified as menacing", "Classifications", "DIA National Dog Database", "count", "per1000"),
    ("dangerous", "1007", "Dogs classified as dangerous", "Classifications", "DIA National Dog Database", "count", "per1000"),
    ("probationary", "1008", "Probationary owners", "Owners", "DIA National Dog Database", "count", None),
    ("disqualified", "1009", "Disqualified owners", "Owners", "DIA National Dog Database", "count", None),
    ("owners", "1010", "Registered dog owners", "Owners", "DIA National Dog Database", "count", None),
    ("infringements", "1011", "Infringements", "Enforcement", "DIA National Dog Database", "count", "per1000"),
    ("prosecutions", "1012", "Prosecutions (Dog Control Act)", "Enforcement", "Ministry of Justice", "count", "per1000"),
    ("destruction", "1013", "Dog destruction orders", "Enforcement", "Ministry of Justice", "count", "per1000"),
    ("acc_claims", "1014", "New ACC claims for dog-related injuries", "Injuries", "ACC", "count", "per1000"),
    ("acc_paid_any", "1015", "ACC paid for dog-related injuries (claims from any year)", "Injuries", "ACC", "nzd", None),
    ("acc_paid_year", "1016", "ACC paid for dog-related injuries (claims from this year)", "Injuries", "ACC", "nzd", None),
]
BREED_ITEMS = ["1001", "1004", "1005", "1006", "1007"]
BREED_ALL_PURE = "aa_all (pure)"
BREED_OTHER_PURE = "zz_other (pure)"
BREED_CROSS = "all (cross)"


def item_code(item: str) -> str:
    return str(item).split("_", 1)[0]


def category_letter(category: str) -> str:
    return str(category).strip()[:1].upper()


def parse_value(value):
    """Return (number, suppressed_marker). Text such as '..' or '<4' is
    MCERT's suppression of small counts and becomes (None, text)."""
    if value is None:
        return None, None
    if isinstance(value, bool):
        return int(value), None
    if isinstance(value, (int, float)):
        return (int(value) if float(value).is_integer() else round(value, 2)), None
    text = str(value).strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", text.replace(",", "")):
        return parse_value(float(text.replace(",", "")))
    return None, text or None


def breed_label(sub: str) -> str:
    return {BREED_ALL_PURE: "All pure breeds", BREED_OTHER_PURE: "Other pure breeds",
            BREED_CROSS: "Cross breeds"}.get(sub, sub)


def read_rows(path: Path):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # openpyxl warns about slicers
        wb = load_workbook(path, read_only=True, data_only=True)
    if SHEET not in wb.sheetnames:
        raise SystemExit(f"{path.name}: no '{SHEET}' sheet (found {wb.sheetnames})")
    rows = wb[SHEET].iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)][: len(HEADER)]
    if header != HEADER:
        raise SystemExit(f"{path.name}: unexpected columns {header}, expected {HEADER}")
    for row in rows:
        if row[0] is None or row[4] is None:
            continue
        yield row[:6]
    wb.close()


def build(path: Path) -> dict:
    by_code = {m[1]: m for m in METRICS}
    values = defaultdict(float)        # (metric, area, year) -> value
    present = set()                    # keys with at least one real number
    suppressed = {}                    # (metric, area, year) -> marker
    breed_values = {}                  # (item, breed, area, year) -> value
    areas, years, breed_years, breeds = set(), set(), set(), set()

    for council, category, sub, item, year, raw in read_rows(path):
        council, sub, year = str(council).strip(), str(sub).strip(), int(year)
        code, letter = item_code(item), category_letter(category)
        number, marker = parse_value(raw)
        areas.add(council)
        years.add(year)

        if letter in "BC" and code in BREED_ITEMS:
            if number is not None:
                breed = BREED_CROSS if letter == "C" else sub
                breeds.add(breed)
                breed_years.add(year)
                breed_values[(code, breed, council, year)] = number
            continue
        if letter == "B" or letter == "C" or code not in by_code:
            continue
        # Registered-dog items are only taken from category A (all dogs).
        if code <= "1007" and letter != "A":
            continue

        key = (by_code[code][0], council, year)
        if number is not None:
            # MoJ rows for 2023-25 are labelled "Act 1997/1998/1999", an
            # autofill slip in the source; all are the 1996 Act, so sum.
            values[key] += number
            present.add(key)
        elif marker:
            suppressed[key] = marker

    year_list = sorted(years)
    councils = sorted(a for a in areas if a not in AGGREGATES)
    area_list = [a for a in AGGREGATES if a in areas] + councils
    area_index = {a: i for i, a in enumerate(area_list)}
    year_index = {y: i for i, y in enumerate(year_list)}

    def clean(v):
        return int(v) if float(v).is_integer() else round(v, 2)

    metrics_out, values_out = [], {}
    for mid, code, label, group, source, unit, rate in METRICS:
        grid = [[None] * len(year_list) for _ in area_list]
        used = set()
        for (m, area, year) in present:
            if m == mid:
                grid[area_index[area]][year_index[year]] = clean(values[(m, area, year)])
                used.add(year)
        if not used:
            continue
        values_out[mid] = grid
        metrics_out.append({"id": mid, "label": label, "group": group, "source": source,
                            "unit": unit, "rate": rate,
                            "years": [min(used), max(used)]})

    breed_year_list = sorted(breed_years)
    by_year = {y: i for i, y in enumerate(breed_year_list)}
    # Order: all pure breeds, named breeds A-Z, other pure, cross breeds.
    named = sorted(b for b in breeds if b not in (BREED_ALL_PURE, BREED_OTHER_PURE, BREED_CROSS))
    breed_list = [b for b in [BREED_ALL_PURE] if b in breeds] + named + \
        [b for b in [BREED_OTHER_PURE, BREED_CROSS] if b in breeds]
    breed_grid = {}
    for code in BREED_ITEMS:
        mid = by_code[code][0]
        breed_grid[mid] = [[[breed_values.get((code, b, a, y)) for y in breed_year_list]
                            for a in area_list] for b in breed_list]

    return {
        "source": {
            "file": path.name,
            "publisher": "MCERT",
            "url": "https://www.mcert.govt.nz/our-work/local-government/dog-control/dog-control-statistics/",
            "licence": "Creative Commons Attribution 3.0 New Zealand",
        },
        "years": year_list,
        "areas": [{"name": a, "type": AGGREGATES.get(a, "council")} for a in area_list],
        "metrics": metrics_out,
        "values": values_out,
        "suppressed": [[m, area_index[a], y, s] for (m, a, y), s in sorted(suppressed.items())],
        "breeds": {
            "years": breed_year_list,
            "names": [breed_label(b) for b in breed_list],
            "kinds": ["all" if b == BREED_ALL_PURE else "other" if b == BREED_OTHER_PURE
                      else "cross" if b == BREED_CROSS else "breed" for b in breed_list],
            "values": breed_grid,
        },
    }


def newest_workbook(raw_dir: Path) -> Path | None:
    files = sorted((p for p in raw_dir.glob("*.xlsx") if not p.name.startswith("~$")),
                   key=lambda p: p.stat().st_mtime)
    return files[-1] if files else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--xlsx", type=Path, help="workbook (default: newest in data/raw/)")
    parser.add_argument("--out", type=Path, default=ROOT / "site" / "data" / "dogs.json")
    args = parser.parse_args(argv)

    raw_dir = ROOT / "data" / "raw"
    path = args.xlsx or newest_workbook(raw_dir)
    if not args.xlsx and len(list(raw_dir.glob("*.xlsx"))) > 1:
        print(f"Several workbooks in {raw_dir}; using the most recently modified. "
              "Pass --xlsx to choose another.")
    if path is None:
        print("No .xlsx found in data/raw/. Download the workbook from MCERT first.")
        return 1

    result = build(path)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
    print(f"{path.name}: {len(result['areas'])} areas, {len(result['metrics'])} metrics, "
          f"{result['years'][0]}-{result['years'][-1]}, {len(result['breeds']['names'])} breed groups "
          f"-> {args.out} ({args.out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
