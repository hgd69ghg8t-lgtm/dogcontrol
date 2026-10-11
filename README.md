# Dog control statistics

Interactive charts of the annual **dog control statistics** published by
[MCERT](https://www.mcert.govt.nz/our-work/local-government/dog-control/dog-control-statistics/#latest-release).
The figures come from the National Dog Database, broken down by territorial
authority.

## How it works

```
data/raw/*.xlsx  ->  scripts/build_data.py  ->  site/data/datasets.json  ->  site/ (static page)
```

1. **Source data.** Download the latest workbook from MCERT (for example
   `Dog-control-statistics-Nov-2025.xlsx`) and save it unchanged in `data/raw/`.
2. **Build.** `scripts/build_data.py` reads every worksheet. For each one it
   finds the header row, uses the first text column as the row label (e.g.
   territorial authority) and treats the numeric columns as measures. Title
   rows and footnotes are kept as notes, and "Total" rows are flagged so they
   aren't charted as if they were councils.
3. **Site.** `site/` is a static page with no dependencies (plain HTML, CSS and
   JS). It has a table picker, a measure picker, sorting, a text filter,
   summary tiles, a horizontal bar chart with tooltips, and a table view. It
   supports light and dark mode, and the current view is stored in the URL
   hash so links can be shared.

## Running locally

```bash
pip install -r requirements.txt
python scripts/build_data.py          # writes site/data/datasets.json
python -m http.server -d site 8000    # open http://localhost:8000
python -m unittest discover tests     # run the tests
```

## Deployment

`.github/workflows/pages.yml` runs the tests, builds the data and deploys
`site/` to GitHub Pages on every push to `main`. To turn it on, go to
**Settings → Pages → Source** and choose "GitHub Actions".

## Updating for a new release

Add the new workbook to `data/raw/`, commit it and push. Earlier releases can
stay in the folder, and every sheet appears in the table picker.

## Data

The statistics are published by MCERT. See the source page for the terms of
reuse, and credit MCERT as the source.
