#!/usr/bin/env node
// Simplify Stats NZ territorial authority (TA) boundaries into a small
// TopoJSON file for the explorer map, tagging each feature with the council
// name MCERT uses so the map can join it to the dog control statistics.
//
// Usage:
//   node scripts/build_geo.mjs [--input FILE] [--out FILE] [--check site/data/dogs.json] [--optional]
//
// Input: the newest .geojson/.json/.zip (zipped shapefile)/.shp in data/geo/.
// With --check, exits non-zero if any MCERT council has no boundary.
// With --optional, a missing boundary file is not an error.

import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, extname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import mapshaper from "mapshaper";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GEO_DIR = join(ROOT, "data", "geo");
const INPUT_TYPES = new Set([".geojson", ".json", ".zip", ".shp"]);
const OUTSIDE_TA = "Area Outside Territorial Authority";

// Stats NZ name (macrons stripped) -> MCERT council name, where they differ.
export const ALIASES = {
  "Auckland": "Auckland (Group)",
  "Lower Hutt City": "Hutt City",
  "Chatham Islands Territory": "Chatham Islands",
};

export function stripMacrons(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

export function toMcertName(statsName) {
  const plain = stripMacrons(String(statsName)).replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  return ALIASES[plain] ?? plain;
}

// MCERT councils with no boundary feature, and features matching no council.
export function coverage(mcertNames, features) {
  const have = new Set(features.map((f) => f.properties.council));
  const want = new Set(mcertNames);
  return {
    missing: mcertNames.filter((n) => !have.has(n)),
    unmatched: features.map((f) => f.properties.council).filter((n) => !want.has(n)),
  };
}

export function findInput(dir = GEO_DIR) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => INPUT_TYPES.has(extname(f).toLowerCase()) && !f.startsWith("."))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return files.at(-1) ?? null;
}

// Find the TA name and code columns by their contents, because shapefiles
// truncate column names (TA2025_V1_00_NAME becomes e.g. TA2025_V_1). The
// name column is the one whose values look like council names; the ASCII
// variant is preferred when there is one.
function pickFields(features) {
  const keys = Object.keys(features[0]?.properties ?? {});
  const values = (k) => features.map((f) => f.properties[k]);
  const share = (k, re) => values(k).filter((v) => typeof v === "string" && re.test(v)).length / features.length;
  const names = keys.filter((k) => share(k, /\b(District|City)\b/) > 0.5);
  const name = names.find((k) => values(k).every((v) => /^[\x00-\x7f]*$/.test(v))) ?? names[0];
  const code = keys.find((k) => share(k, /^\d{3}$/) > 0.9);
  if (!name) throw new Error(`No TA name column found in boundary file (columns: ${keys.join(", ")})`);
  return {name, code};
}

function looksProjected(fc) {
  for (const f of fc.features) {
    let c = f.geometry?.coordinates;
    while (Array.isArray(c?.[0])) c = c[0];
    if (Array.isArray(c)) return Math.abs(c[0]) > 360 || Math.abs(c[1]) > 90;
  }
  return false;
}

async function run(commands, inputs) {
  const out = await mapshaper.applyCommands(commands, inputs);
  return JSON.parse(String(Object.values(out)[0]));
}

export async function buildGeo(input, {percentage = "3%"} = {}) {
  // 1. Read whatever format was uploaded and convert to GeoJSON. Shapefiles
  //    carry a .prj, so mapshaper can reproject them (e.g. from NZTM).
  const isShape = /\.(zip|shp)$/i.test(input);
  let fc = await run(`-i "${input}" ${isShape ? "-proj wgs84 " : ""}-o format=geojson out.json`);
  if (!isShape && looksProjected(fc)) {
    // GeoJSON exported in NZTM 2000 (EPSG:2193), Stats NZ's default.
    fc = await run(`-i in.json -proj wgs84 init=EPSG:2193 -o format=geojson out.json`, {"in.json": JSON.stringify(fc)});
  }

  // 2. Keep only real TAs, with a small, consistent set of properties.
  const fields = pickFields(fc.features);
  fc.features = fc.features
    .filter((f) => f.geometry && stripMacrons(String(f.properties[fields.name])) !== OUTSIDE_TA)
    .map((f) => ({
      type: "Feature",
      properties: {
        council: toMcertName(f.properties[fields.name]),
        statsnz: String(f.properties[fields.name]),
        code: fields.code ? String(f.properties[fields.code]) : null,
      },
      geometry: f.geometry,
    }));

  // 3. Simplify (keeping shared borders and small islands' main shapes) and
  //    write TopoJSON.
  return run(
    `-i in.json -simplify ${percentage} weighted keep-shapes -clean -o format=topojson quantization=100000 out.json`,
    {"in.json": JSON.stringify(fc)}
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input ?? findInput();
  if (!input) {
    console.error(`No boundary file in ${GEO_DIR}. See data/geo/README.md.`);
    return args.optional ? 0 : 1;
  }
  const topo = await buildGeo(input);
  const text = JSON.stringify(topo);
  const layer = Object.values(topo.objects)[0];
  console.error(`${input}: ${layer.geometries.length} councils -> ${Math.round(text.length / 1024)} KB TopoJSON`);
  if (args.out) writeFileSync(args.out, text);
  else if (!args.check) process.stdout.write(text);

  if (args.check) {
    const dogs = JSON.parse(readFileSync(args.check, "utf-8"));
    const councils = dogs.areas.filter((a) => a.type === "council").map((a) => a.name);
    const {missing, unmatched} = coverage(councils, layer.geometries);
    if (unmatched.length) console.error(`Boundaries with no MCERT council: ${unmatched.join(", ")}`);
    if (missing.length) {
      console.error(`MCERT councils with no boundary: ${missing.join(", ")}`);
      console.error("Add the Stats NZ name to ALIASES in scripts/build_geo.mjs.");
      return 1;
    }
    console.error(`All ${councils.length} MCERT councils have a boundary.`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
