// Shared helpers for the explorer pages: measures, rates, formatting and
// colours. The rate and caveat rules mirror site/app.js so both views agree.

export const SUSPECT_YEAR = 2024; // National Dog Database snapshot far below the years either side
export const BREED_MIN_DOGS = 100; // fewer registered dogs of a breed gives unstable rates
export const SCHEDULE_4 = new Set([
  "Terrier, American Pit Bull", "Brazilian Fila", "Dogo Argentino", "Tosa, Japanese", "Perro de Presa Canario"
]);

// Five-class sequential blue ramps (low -> high), checked with the dataviz
// palette validator in ordinal mode against each surface.
export const RAMP = {
  light: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
  dark: ["#184f95", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"]
};
export const INK = {
  light: {surface: "#fcfcfb", noData: "#e1e0d9", hatch: "#898781", selected: "#0b0b0b", nz: "#898781"},
  dark: {surface: "#1a1a19", noData: "#2c2c2a", hatch: "#898781", selected: "#f0efec", nz: "#898781"}
};
export const SERIES = {light: "#2a78d6", dark: "#3987e5"};

const nf0 = new Intl.NumberFormat("en-NZ", {maximumFractionDigits: 0});
const nf1 = new Intl.NumberFormat("en-NZ", {maximumFractionDigits: 1, minimumFractionDigits: 1});
const nzd = new Intl.NumberFormat("en-NZ", {style: "currency", currency: "NZD", maximumFractionDigits: 0});
const compact = new Intl.NumberFormat("en-NZ", {notation: "compact", maximumFractionDigits: 1});
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const fmtInt = (v) => (isNum(v) ? nf0.format(v) : "–");
export const fmtCompact = (v) => (isNum(v) ? compact.format(v) : "–");

export const isSuspect = (metric, year) => year === SUSPECT_YEAR && metric.source.startsWith("DIA");
export const areaIndex = (D, name) => D.areas.findIndex((a) => a.name === name);
export const councils = (D) => D.areas.map((a, i) => ({...a, i})).filter((a) => a.type === "council");

// A metric plus a display mode ("count" or "rate"): reads and formats values.
export function measure(D, metricId, mode) {
  const m = D.metrics.find((x) => x.id === metricId);
  const rate = mode === "rate" && m.rate ? m.rate : null;
  const label = rate === "pct" ? `${m.label} (% of registered dogs)`
    : rate === "per1000" ? `${m.label} per 1,000 registered dogs` : m.label;
  const unit = rate === "pct" ? "%" : rate === "per1000" ? "per 1,000 dogs" : m.unit === "nzd" ? "NZD" : "";
  const format = (v) => !isNum(v) ? "–" : rate === "pct" ? `${nf1.format(v)}%` : rate ? nf1.format(v)
    : m.unit === "nzd" ? nzd.format(v) : nf0.format(v);
  return {
    metric: m, rate, label, unit, format,
    years: D.years.filter((y) => y >= m.years[0] && y <= m.years[1]),
    value(area, year) {
      const yi = D.years.indexOf(year);
      const v = D.values[m.id][area]?.[yi];
      if (!isNum(v)) return null;
      if (!rate) return v;
      const dogs = D.values.dogs[area][yi];
      if (!isNum(dogs) || dogs <= 0) return null;
      return rate === "pct" ? (100 * v) / dogs : (1000 * v) / dogs;
    },
    suppressed(area, year) {
      const hit = D.suppressed.find((s) => s[0] === m.id && s[1] === area && s[2] === year);
      return hit ? hit[3] : null;
    }
  };
}

export function metricOptions(D) {
  return new Map(D.metrics.map((m) => [m.label, m.id]));
}

// Values for the breed x council explorer.
export const BREED_VIEWS = [
  {id: "count", item: "dogs", unit: "", label: "Registered dogs (count)"},
  {id: "share", item: "dogs", unit: "%", label: "Share of the council's registered dogs"},
  {id: "menacing", item: "menacing", unit: "per 1,000", rate: 1000, label: "Menacing, per 1,000 dogs of the breed"},
  {id: "dangerous", item: "dangerous", unit: "per 1,000", rate: 1000, label: "Dangerous, per 1,000 dogs of the breed"},
  {id: "desexed", item: "desexed", unit: "%", rate: 100, label: "De-sexed, % of the breed"},
  {id: "microchipped", item: "microchipped", unit: "%", rate: 100, label: "Micro-chipped, % of the breed"}
];
export const SHARE_VIEW = BREED_VIEWS[1];

// {value, count, breedDogs, ok}; ok=false means too few dogs for a stable rate.
export function breedCell(D, view, b, area, year) {
  const B = D.breeds;
  const byi = B.years.indexOf(year);
  if (byi < 0) return null;
  const breedDogs = B.values.dogs[b][area][byi];
  const count = B.values[view.item][b][area][byi];
  if (!isNum(count)) return null;
  if (view.id === "count") return {value: count, count, breedDogs, ok: true};
  if (view.id === "share") {
    const dogs = D.values.dogs[area][D.years.indexOf(year)];
    return isNum(dogs) && dogs > 0 ? {value: (100 * count) / dogs, count, breedDogs, ok: true} : null;
  }
  if (!isNum(breedDogs) || breedDogs <= 0) return null;
  return {value: (view.rate * count) / breedDogs, count, breedDogs, ok: breedDogs >= BREED_MIN_DOGS};
}

export function formatBreedValue(view, v) {
  if (!isNum(v)) return "–";
  if (view.id === "count") return nf0.format(v);
  return view.unit === "%" ? `${nf1.format(v)}%` : nf1.format(v);
}

export function csvDownload(rows, filename, html) {
  const cols = Object.keys(rows[0] ?? {});
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const text = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const href = URL.createObjectURL(new Blob([text], {type: "text/csv"}));
  return html`<a class="muted" download=${filename} href=${href}>Download this table (CSV, ${rows.length} rows)</a>`;
}
