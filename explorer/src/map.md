---
title: Council map
---

```js
import * as Plot from "@observablehq/plot";
import * as Inputs from "@observablehq/inputs";
import * as d3 from "d3";
import {html} from "htl";
import * as topojson from "topojson-client";
import {INK, RAMP, SERIES, SUSPECT_YEAR, councils, fmtInt, isNum, isSuspect, measure, metricOptions} from "./components/data.js";
import {CHATHAMS, WELLINGTON, choropleth, colorClasses, legend} from "./components/map.js";
```

```js
const D = await FileAttachment("data/dogs.json").json();
const topo = await FileAttachment("data/councils.json").json();
const features = topo ? topojson.feature(topo, Object.values(topo.objects)[0]).features : [];
const params = new URLSearchParams(location.search);
```

# Dog control by council

<p class="lede">How the 67 councils compare on registered dogs, menacing and dangerous classifications, enforcement and dog-related injuries. Hover over a council for its figures; click it, or select its row in the table, for its trend and breed mix.</p>

```js
const metricInput = Inputs.select(metricOptions(D), {
  label: "Measure",
  value: D.metrics.some((m) => m.id === params.get("m")) ? params.get("m") : "menacing"
});
const metricId = Generators.input(metricInput);
```

```js
const hasRate = !!D.metrics.find((m) => m.id === metricId).rate;
const modeInput = Inputs.radio(new Map([["Count", "count"], ["Rate", "rate"]]), {
  label: "Show as",
  value: hasRate && params.get("mode") !== "count" ? "rate" : "count",
  disabled: hasRate ? [] : ["rate"]
});
const mode = Generators.input(modeInput);
```

```js
const M = measure(D, metricId, mode);
const yMin = M.years[0], yMax = M.years[M.years.length - 1];
const wanted = Number(params.get("year"));
const yearInput = Inputs.range([yMin, yMax], {
  label: "Year to June",
  step: 1,
  value: wanted >= yMin && wanted <= yMax ? wanted : yMax
});
const year = Generators.input(yearInput);

// Step through the years; stops at the last one or when pressed again.
const playButton = html`<button type="button" class="play">▶ Play</button>`;
let timer = null;
const setYear = (y) => { yearInput.value = y; yearInput.dispatchEvent(new Event("input", {bubbles: true})); };
const stop = () => { clearInterval(timer); timer = null; playButton.textContent = "▶ Play"; };
playButton.onclick = () => {
  if (timer) return stop();
  if (+yearInput.value >= yMax) setYear(yMin);
  playButton.textContent = "❚❚ Pause";
  timer = setInterval(() => (+yearInput.value >= yMax ? stop() : setYear(+yearInput.value + 1)), 900);
};
invalidation.then(stop);
```

```js
const selected = Mutable(D.areas.some((a) => a.name === params.get("council")) ? params.get("council") : null);
const select = (council) => (selected.value = council);
```

<div class="controls">${metricInput}${modeInput}${yearInput}${playButton}</div>

```js
const ink = dark ? INK.dark : INK.light;
const ramp = dark ? RAMP.dark : RAMP.light;
const list = councils(D);
const valued = list.map((a) => ({name: a.name, i: a.i, value: M.value(a.i, year)})).filter((r) => isNum(r.value));
const rank = new Map(valued.slice().sort((a, b) => b.value - a.value).map((r, k) => [r.name, k + 1]));
const dogsM = measure(D, "dogs", "count");
const countM = measure(D, metricId, "count");
const rows = new Map(list.map((a) => {
  const value = M.value(a.i, year);
  const suppressed = M.suppressed(a.i, year);
  const lines = [
    a.name,
    `${M.label}: ${isNum(value) ? M.format(value) : suppressed ? `suppressed (${suppressed})` : "no data"}`,
    M.rate && isNum(value) ? `${countM.format(countM.value(a.i, year))} of ${dogsM.format(dogsM.value(a.i, year))} registered dogs` : null,
    rank.has(a.name) ? `Rank ${rank.get(a.name)} of ${valued.length} (1 = highest)` : null
  ].filter(Boolean);
  return [a.name, {value, suppressed, title: lines.join("\n")}];
}));
const color = colorClasses(valued.map((r) => r.value), ramp, {
  unknown: ink.noData,
  tickFormat: (v) => M.format(v),
  label: `${M.label}, ${year}`
});
const row = (name) => rows.get(name);
```

```js
// The URL holds the view so it can be shared.
history.replaceState(null, "", `?${new URLSearchParams({m: metricId, mode, year, ...(selected ? {council: selected} : {})})}`);
```

```js
const missing = list.filter((a) => !isNum(rows.get(a.name).value)).map((a) => a.name);
const caveats = [
  isSuspect(M.metric, year) ? html`<p class="muted"><b>Caution:</b> the ${SUSPECT_YEAR} National Dog Database snapshot is far lower than the years either side for almost every council. These are the published figures.</p>` : "",
  missing.length ? html`<p class="muted">No value for ${year} (grey${M.metric.id === "acc_claims" ? "; hatched = suppressed by ACC" : ""}): ${missing.length > 6 ? `${missing.length} councils` : missing.join(", ")}.</p>` : ""
];
const mainland = features.filter((f) => f.properties.council !== CHATHAMS);
const wellington = features.filter((f) => WELLINGTON.has(f.properties.council));
const chathams = features.filter((f) => f.properties.council === CHATHAMS);
const mapOpts = {row, color, ink, selected, onSelect: select};
```

```js
const panel = (() => {
  if (!selected) return html`<div class="panel"><h3>Pick a council</h3><p class="muted">Click a council on the map, or select its row in the table, to see its trend and most common breeds.</p></div>`;
  const ai = D.areas.findIndex((a) => a.name === selected);
  const nz = D.areas.findIndex((a) => a.type === "national");
  const v = M.value(ai, year);
  const trend = M.years.flatMap((y) => [
    {year: y, value: M.value(ai, y), who: selected},
    ...(M.rate ? [{year: y, value: M.value(nz, y), who: "New Zealand"}] : [])
  ]).filter((d) => isNum(d.value));
  const B = D.breeds;
  const by = B.years.includes(year) ? year : B.years[B.years.length - 1];
  const byi = B.years.indexOf(by);
  const breeds = B.names.map((name, b) => ({name, kind: B.kinds[b], n: B.values.dogs[b][ai][byi]}))
    .filter((d) => d.kind !== "all" && isNum(d.n) && d.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  const dash = `../index.html#${new URLSearchParams({area: selected, year, m: metricId, mode})}`;
  return html`<div class="panel">
    <h3>${selected}</h3>
    <div class="muted">${M.label}, year to June ${year}</div>
    <div class="big">${isNum(v) ? M.format(v) : "–"}</div>
    ${resize((w) => Plot.plot({
      width: w, height: 170, marginLeft: 44,
      x: {label: null, tickFormat: "d", ticks: Math.min(6, M.years.length)},
      y: {grid: true, label: null, nice: true, zero: true},
      color: M.rate ? {domain: [selected, "New Zealand"], range: [dark ? SERIES.dark : SERIES.light, ink.nz], legend: true} : undefined,
      marks: [
        Plot.ruleY([0]),
        Plot.line(trend, {x: "year", y: "value", stroke: M.rate ? "who" : (dark ? SERIES.dark : SERIES.light), strokeWidth: 2}),
        Plot.dot(trend.filter((d) => d.year === year), {x: "year", y: "value", fill: M.rate ? "who" : (dark ? SERIES.dark : SERIES.light), r: 4}),
        Plot.tip(trend, Plot.pointerX({x: "year", y: "value", title: (d) => `${d.who}, ${d.year}\n${M.format(d.value)}`}))
      ]
    }))}
    <h4 style="margin:12px 0 0">Most common breeds, ${by}</h4>
    ${resize((w) => Plot.plot({
      width: w, height: 24 * breeds.length + 20, marginLeft: Math.min(170, w * 0.45), marginRight: 48,
      x: {axis: null}, y: {label: null, domain: breeds.map((d) => d.name)},
      marks: [
        Plot.barX(breeds, {y: "name", x: "n", fill: (d) => (d.kind === "breed" ? (dark ? SERIES.dark : SERIES.light) : ink.nz), rx: 3, insetTop: 3, insetBottom: 3}),
        Plot.text(breeds, {y: "name", x: "n", text: (d) => fmtInt(d.n), textAnchor: "start", dx: 4})
      ]
    }))}
    <p class="muted">Grey bars are group totals (cross breeds, other pure breeds). <a href=${dash}>Open in the dashboard →</a></p>
  </div>`;
})();
```

<div class="map-layout">
  <div class="map-stack">
    ${features.length ? legend(color) : ""}
    ${features.length
      ? resize((width) => choropleth(mainland, {...mapOpts, width, height: Math.round(Math.min(width * 1.35, 860)), label: `${M.label} by council, ${year}`}))
      : html`<div class="empty-note"><b>Map not available yet.</b> Council boundaries haven't been added to <code>data/geo/</code>. The table below has every council's figures.</div>`}
    ${features.length ? html`<div class="insets">
      <div class="inset"><h4>Wellington region</h4>${resize((width) => choropleth(wellington, {...mapOpts, width, height: Math.round(width * 0.9)}))}</div>
      <div class="inset"><h4>Chatham Islands</h4>${resize((width) => choropleth(chathams, {...mapOpts, width, height: Math.round(width * 0.9)}))}</div>
    </div>` : ""}
    ${caveats}
  </div>
  <div>${panel}</div>
</div>

## All councils

```js
const tableRows = list.map((a) => {
  const r = rows.get(a.name);
  return {Rank: rank.get(a.name) ?? null, Council: a.name, Value: r.value, "Registered dogs": dogsM.value(a.i, year)};
});
const table = Inputs.table(tableRows, {
  columns: ["Rank", "Council", "Value", "Registered dogs"],
  header: {Value: `${M.label}, ${year}`},
  format: {Value: (v) => M.format(v), "Registered dogs": fmtInt, Rank: (v) => (v ?? "–")},
  sort: "Rank",
  multiple: false,
  required: false,
  rows: 16,
  layout: "auto",
  value: tableRows.find((r) => r.Council === selected)
});
table.addEventListener("input", () => table.value && select(table.value.Council));
display(table);
```

<p class="muted">Rates are counts divided by the council's registered dogs in the same year. Source: ${M.metric.source}.</p>
