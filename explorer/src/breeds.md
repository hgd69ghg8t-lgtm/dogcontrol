---
title: Breed explorer
---

```js
import * as Plot from "@observablehq/plot";
import * as Inputs from "@observablehq/inputs";
import {html} from "htl";
import * as topojson from "topojson-client";
import {BREED_MIN_DOGS, BREED_VIEWS, SHARE_VIEW, INK, RAMP, SCHEDULE_4, SERIES, SUSPECT_YEAR, breedCell, councils, csvDownload, fmtInt, formatBreedValue, isNum} from "./components/data.js";
import {CHATHAMS, choropleth, colorClasses, legend} from "./components/map.js";
```

```js
const D = await FileAttachment("data/dogs.json").json();
const topo = await FileAttachment("data/councils.json").json();
const features = topo ? topojson.feature(topo, Object.values(topo.objects)[0]).features : [];
const B = D.breeds;
const NZ = D.areas.findIndex((a) => a.type === "national");
```

# Breeds by council

<p class="lede">Where each breed is registered, and how menacing and dangerous classifications, de-sexing and micro-chipping vary by breed and council. MCERT reports 34 named pure breeds; all other pure breeds are grouped together. Click a cell to profile that breed.</p>

```js
const viewInput = Inputs.select(BREED_VIEWS, {label: "Show", format: (d) => d.label, value: SHARE_VIEW});
const breedView = Generators.input(viewInput);
const yearInput = Inputs.select(B.years.slice().reverse(), {label: "Year to June", format: String});
const year = Generators.input(yearInput);
const groupsInput = Inputs.toggle({label: "Include group totals", value: false});
const groups = Generators.input(groupsInput);
const breedSortInput = Inputs.select(["Most registered nationally", "A–Z"], {label: "Sort breeds"});
const breedSort = Generators.input(breedSortInput);
const councilSortInput = Inputs.select(["A–Z", "Most registered dogs", "Profiled breed (highest first)"], {label: "Sort councils"});
const councilSort = Generators.input(councilSortInput);
const searchInput = Inputs.text({label: "Find council", placeholder: "e.g. Otago"});
const search = Generators.input(searchInput);
```

```js
const named = B.names.map((name, b) => ({name, b, kind: B.kinds[b]})).filter((d) => d.kind === "breed");
const profile = Mutable("Retriever, Labrador");
const setProfile = (name) => (profile.value = name);
```

<div class="controls">${viewInput}${yearInput}${groupsInput}</div>
<div class="controls">${breedSortInput}${councilSortInput}${searchInput}</div>

```js
const ink = dark ? INK.dark : INK.light;
const ramp = dark ? RAMP.dark : RAMP.light;
const byi = B.years.indexOf(year);
const yi = D.years.indexOf(year);
const pb = B.names.indexOf(profile);
const breeds = B.names.map((name, b) => ({name, b, kind: B.kinds[b], national: B.values.dogs[b][NZ][byi] ?? 0}))
  .filter((d) => d.kind === "breed" || (groups && d.kind !== "all"))
  .sort((a, c) => (breedSort === "A–Z" ? a.name.localeCompare(c.name) : c.national - a.national));
const q = search.trim().toLowerCase();
const councilList = councils(D)
  .filter((a) => !q || a.name.toLowerCase().includes(q))
  .map((a) => ({...a, dogs: D.values.dogs[a.i][yi] ?? 0, profiled: breedCell(D, breedView, pb, a.i, year)}))
  .sort((a, c) => councilSort === "Most registered dogs" ? c.dogs - a.dogs
    : councilSort.startsWith("Profiled") ? (c.profiled?.ok ? c.profiled.value : -Infinity) - (a.profiled?.ok ? a.profiled.value : -Infinity)
    : a.name.localeCompare(c.name));
const noDogs = councilList.filter((a) => !a.dogs).map((a) => a.name);
const cells = councilList.flatMap((a) => breeds.map((br) => {
  const c = breedCell(D, breedView, br.b, a.i, year);
  return c && {council: a.name, breed: br.name, ...c};
})).filter(Boolean);
const color = colorClasses(cells.filter((c) => c.ok).map((c) => c.value), ramp, {
  unknown: ink.noData, tickFormat: (v) => formatBreedValue(breedView, v), label: `${breedView.label}, ${year}`
});
const cellTitle = (d) => [
  `${d.breed} in ${d.council}`,
  breedView.id === "count" ? `${fmtInt(d.count)} registered` : `${formatBreedValue(breedView, d.value)} ${breedView.id === "share" ? "of the council's registered dogs" : breedView.unit === "%" ? "of the breed" : "per 1,000 of the breed"}`,
  breedView.id === "share" || breedView.id === "count" ? null : `${fmtInt(d.count)} of ${fmtInt(d.breedDogs)} registered`,
  d.ok ? null : `Fewer than ${BREED_MIN_DOGS} registered: rate not shown`
].filter(Boolean).join("\n");
```

```js
const heatmap = (width) => {
  const w = Math.max(760, width);
  const fig = Plot.plot({
    width: w,
    height: 130 + 16 * councilList.length,
    marginLeft: 180, marginTop: 130, marginRight: 8, marginBottom: 4,
    x: {axis: "top", label: null, tickRotate: -60, domain: breeds.map((d) => d.name), tickFormat: (s) => (s.length > 24 ? `${s.slice(0, 23)}…` : s)},
    y: {label: null, domain: councilList.map((d) => d.name)},
    color: {...color, legend: false},
    marks: [
      Plot.cell(cells.filter((d) => d.ok), {x: "breed", y: "council", fill: "value", inset: 0.5}),
      Plot.cell(cells.filter((d) => !d.ok), {x: "breed", y: "council", fill: ink.noData, inset: 0.5}),
      Plot.cell(cells.filter((d) => d.breed === profile), {x: "breed", y: "council", stroke: ink.selected, strokeWidth: 1, inset: 0}),
      Plot.tip(cells, Plot.pointer({x: "breed", y: "council", title: cellTitle}))
    ]
  });
  fig.style.cursor = "pointer";
  fig.addEventListener("click", () => fig.value && setProfile(fig.value.breed));
  return fig;
};
```

${legend(color)}
<p class="muted">Grey cells: fewer than ${BREED_MIN_DOGS} registered dogs of that breed in the council, too few for a stable rate. No cell: none registered.${noDogs.length ? ` No registered dogs are recorded for ${noDogs.join(", ")} in ${year}, so ${noDogs.length > 1 ? "their rows are" : "its row is"} empty.` : ""}${year === SUSPECT_YEAR ? html` <b>Caution:</b> the ${SUSPECT_YEAR} snapshot is far lower than the years either side for almost every council.` : ""}</p>
<div class="scroll-x">${resize((width) => heatmap(width))}</div>

${cells.length ? csvDownload(cells.map((d) => ({year, council: d.council, breed: d.breed, measure: breedView.id, value: d.ok ? +d.value.toFixed(3) : "", count: d.count, breed_registered: d.breedDogs})), `dog-breeds-${breedView.id}-${year}.csv`, html) : ""}

## Breed profile

```js
const profileInput = Inputs.select(named.map((d) => d.name).sort(), {label: "Breed", value: profile});
profileInput.addEventListener("input", () => setProfile(profileInput.value));
display(profileInput);
```

```js
const series = (item) => B.years.map((y, i) => ({year: y, value: B.values[item][pb][NZ][i]})).filter((d) => isNum(d.value));
const reg = series("dogs");
const rateTrend = breedView.id === "count" || breedView.id === "share"
  ? B.years.map((y, i) => {
    const n = B.values.dogs[pb][NZ][i], dogs = D.values.dogs[NZ][D.years.indexOf(y)];
    return {year: y, value: isNum(n) && dogs ? (100 * n) / dogs : null};
  }).filter((d) => isNum(d.value))
  : B.years.map((y) => ({year: y, value: breedCell(D, breedView, pb, NZ, y)?.value})).filter((d) => isNum(d.value));
const rateLabel = breedView.id === "count" || breedView.id === "share" ? "Share of all registered dogs (%)" : breedView.label;
const blue = dark ? SERIES.dark : SERIES.light;
const lineChart = (data, label, fmt) => (width) => Plot.plot({
  width, height: 200, marginLeft: 52,
  x: {label: null, tickFormat: "d"},
  y: {grid: true, label, nice: true, zero: true, tickFormat: fmt},
  marks: [
    Plot.ruleY([0]),
    Plot.line(data, {x: "year", y: "value", stroke: blue, strokeWidth: 2}),
    Plot.dot(data.filter((d) => d.year === year), {x: "year", y: "value", fill: blue, r: 4}),
    Plot.tip(data, Plot.pointerX({x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)}`}))
  ]
});
const byCouncil = new Map(councils(D).map((a) => [a.name, breedCell(D, breedView, pb, a.i, year)]));
const profColor = colorClasses([...byCouncil.values()].filter((c) => c?.ok).map((c) => c.value), ramp, {
  unknown: ink.noData, tickFormat: (v) => formatBreedValue(breedView, v), label: `${profile}: ${breedView.label.toLowerCase()}, ${year}`
});
const profRow = (name) => {
  const c = byCouncil.get(name);
  return {value: c?.ok ? c.value : null, title: c ? cellTitle({...c, council: name, breed: profile}) : `${name}\nNone registered`};
};
const top = [...byCouncil].filter(([, c]) => c?.ok).sort((a, b) => b[1].value - a[1].value).slice(0, 15);
```

<p class="muted">${SCHEDULE_4.has(profile) ? html`<b>${profile}</b> is listed in Schedule 4 of the Dog Control Act 1996, so every dog of this breed must be classified as menacing.` : ""}</p>

<div class="grid grid-cols-2">
  <div class="card"><h2>${profile}: registered dogs in New Zealand</h2>${resize(lineChart(reg, "Registered dogs", fmtInt))}</div>
  <div class="card"><h2>${rateLabel}, New Zealand</h2>${resize(lineChart(rateTrend, null, (v) => formatBreedValue(breedView.id === "count" ? SHARE_VIEW : breedView, v)))}</div>
</div>

<div class="grid grid-cols-2">
  <div class="card">
    <h2>By council, ${year}</h2>
    ${features.length ? legend(profColor) : ""}
    ${features.length
      ? resize((width) => choropleth(features.filter((f) => f.properties.council !== CHATHAMS), {row: profRow, color: profColor, ink, width, height: Math.round(Math.min(width * 1.35, 700)), label: `${profile} by council`}))
      : html`<p class="muted">The map appears once council boundaries are added to <code>data/geo/</code>.</p>`}
  </div>
  <div class="card">
    <h2>Highest 15 councils, ${year}</h2>
    ${resize((width) => Plot.plot({
      width, height: 24 * top.length + 24, marginLeft: Math.min(180, width * 0.45), marginRight: 56,
      x: {axis: null}, y: {label: null, domain: top.map(([n]) => n)},
      marks: [
        Plot.barX(top, {y: ([n]) => n, x: ([, c]) => c.value, fill: blue, rx: 3, insetTop: 3, insetBottom: 3}),
        Plot.text(top, {y: ([n]) => n, x: ([, c]) => c.value, text: ([, c]) => formatBreedValue(breedView, c.value), textAnchor: "start", dx: 4})
      ]
    }))}
  </div>
</div>
