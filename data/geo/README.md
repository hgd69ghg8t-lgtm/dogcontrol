# Upload the council boundaries here

The explorer's maps need New Zealand territorial authority (council) boundaries from
Stats NZ. Download them once and add the file to this folder.

1. Go to [Stats NZ Datafinder](https://datafinder.stats.govt.nz/) and search for
   **"Territorial Authority 2025 Clipped (generalised)"**. Sign in (it's free) to download.
2. When you export, choose:
   - **Format:** GeoJSON. A Shapefile also works; upload the whole `.zip`.
   - **Map projection:** WGS 84 (EPSG:4326). NZTM (EPSG:2193) also works; the build converts it.
3. Upload the file to this folder. On GitHub, open `data/geo/`, then click
   **Add file → Upload files**.

`scripts/build_geo.mjs` simplifies the boundaries to a small TopoJSON file when the site
is built, and it fails if any MCERT council can't be matched to a boundary. Only the
newest boundary file in this folder is used.

Licence: Stats NZ boundaries are CC BY 4.0. The site credits Stats NZ in its footer.
