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

### Explorer (`/explore/`)

A second set of pages, built with [Observable Framework](https://observablehq.com/framework/):

- **Council map:** a choropleth of any measure across the 67 councils, as a count or a
  rate. It has a year slider with a play button, insets for the Wellington region and
  the Chatham Islands, and a ranked table. Clicking a council opens a panel with its
  trend and most common breeds.
- **Breed explorer:** a breed × council heatmap showing each breed's share of a council's
  dogs, menacing and dangerous rates, and de-sexing and micro-chipping. It includes a
  profile and map for any breed, and a CSV download.

The maps need council boundaries from Stats NZ; see `data/geo/README.md`. Until a
boundary file is added, the explorer shows tables in place of the maps.

## How it works

```
data/raw/*.xlsx  ->  scripts/build_data.py  ->  site/data/dogs.json  ->  site/ (dashboard)
                                            \->  explorer/ (Framework)  ->  site/explore/
data/geo/*       ->  scripts/build_geo.mjs  ->  council TopoJSON (maps)
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

`scripts/build_geo.mjs` simplifies the Stats NZ boundaries with mapshaper and tags each
council with MCERT's name for it. It strips macrons and applies a few aliases, such as
"Lower Hutt City" → "Hutt City". With `--check`, it fails if any MCERT council has no
boundary.

`explorer/` holds the Framework pages. Its data loaders call `build_data.py` and
`build_geo.mjs`, so the dashboard and the explorer use the same figures. All charting
libraries are installed from npm and bundled at build time, with nothing fetched from
a CDN.

## Running locally

```bash
pip install -r requirements.txt
npm ci
python scripts/build_data.py          # writes site/data/dogs.json
python -m http.server -d site 8000    # dashboard at http://localhost:8000
npm run explore:dev                   # explorer with live reload
python -m unittest discover tests     # Python tests
npm test                              # boundary name-matching tests
```

To build everything as CI does:
`npm run explore:build && rm -rf site/explore && cp -r explorer/dist site/explore`.

`site/data/dogs.json` is generated, so it isn't committed.

## Updating for a new release

Download the new workbook from MCERT, add it to `data/raw/`, commit it and push.
When the folder holds several workbooks, the build uses the most recently modified
one; pass `--xlsx` to choose a different one.

## Deployment

`.github/workflows/pages.yml` runs the tests, builds the data, checks the boundaries,
builds the explorer into `site/explore/`, and deploys `site/` to GitHub Pages on every
push to `main`. To turn it on, go to
**Settings → Pages → Source** and choose "GitHub Actions".

## Data licence

Source: MCERT dog control statistics, licensed under
[Creative Commons Attribution 3.0 New Zealand](https://creativecommons.org/licenses/by/3.0/nz/).
Council boundaries: Stats NZ, licensed under CC BY 4.0.
