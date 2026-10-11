# NZ dog control statistics

Interactive charts of New Zealand's annual **dog control statistics**, published by
[MCERT](https://www.mcert.govt.nz/our-work/local-government/dog-control/dog-control-statistics/#latest-release).
The figures combine the DIA National Dog Database, the Ministry of Justice and ACC,
for every council, by financial year (ending 30 June).

## What the site shows

- **At a glance:** registered dogs, owners, menacing and dangerous dogs, ACC claims
  and prosecutions for the selected area and year, with change since the previous year.
- **Trend:** any measure over time, as a count or a rate (per 1,000 registered dogs,
  or % of registered dogs). Up to three areas can be compared.
- **Councils compared:** all 67 councils ranked for the chosen measure and year, plus
  a table of every measure. Click a council to select it.
- **Breeds:** registered, de-sexed, micro-chipped, menacing and dangerous dogs for 34
  named breeds, as counts or as rates within each breed.
- **About the data:** sources, licence and caveats. In particular, the 2024 snapshot
  is much lower than the years either side for almost every council.

The selected area, year, measure and comparison are kept in the URL, so a view can be
shared as a link.

## How it works

```
data/raw/*.xlsx  ->  scripts/build_data.py  ->  site/data/dogs.json  ->  site/ (static page)
```

`scripts/build_data.py` reads the workbook's **`raw data`** sheet. That sheet is in
long format, with the columns council, category, subcategory, item, FY ending 30 June
and value. The script turns it into a compact JSON grid of measure × area × year.
Along the way it:

- keeps breed rows (categories B and C) separate from the all-dogs totals (category A);
- records suppressed values (`..`, `<4`) as missing and lists them for the page;
- merges the Ministry of Justice rows for 2023–25, which the source mislabels as the
  "Dog Control Act 1997/1998/1999", into the Dog Control Act 1996 figures;
- fails with a clear error if the sheet's columns change.

`site/` is a static page with no dependencies (plain HTML, CSS and JS), and supports
light and dark mode.

## Running locally

```bash
pip install -r requirements.txt
python scripts/build_data.py          # writes site/data/dogs.json
python -m http.server -d site 8000    # open http://localhost:8000
python -m unittest discover tests     # run the tests
```

`site/data/dogs.json` is generated, so it isn't committed.

## Updating for a new release

Download the new workbook from MCERT, add it to `data/raw/`, commit it and push.
When the folder holds several workbooks, the build uses the most recently modified
one; pass `--xlsx` to choose a different one.

## Deployment

`.github/workflows/pages.yml` runs the tests, builds the data and deploys `site/` to
GitHub Pages on every push to `main`. To turn it on, go to
**Settings → Pages → Source** and choose "GitHub Actions".

## Data licence

Source: MCERT dog control statistics, licensed under
[Creative Commons Attribution 3.0 New Zealand](https://creativecommons.org/licenses/by/3.0/nz/).
