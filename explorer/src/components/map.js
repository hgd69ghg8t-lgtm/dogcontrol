// Choropleth helpers for council maps (Observable Plot + d3-geo).
import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import {svg} from "htl";

// Councils too small to see on the national map get a zoomed inset.
export const WELLINGTON = new Set([
  "Wellington City", "Hutt City", "Upper Hutt City", "Porirua City", "Kapiti Coast District", "South Wairarapa District"
]);
export const CHATHAMS = "Chatham Islands";

// Transverse Mercator centred on New Zealand; Plot fits it to `domain`.
const projection = (features) => ({
  type: () => d3.geoTransverseMercator().rotate([-173, 41]),
  domain: {type: "FeatureCollection", features}
});

// Up to five quantile classes as a threshold scale, so the main map, insets
// and legend all share one set of breaks. Ties (e.g. many zeros) merge classes.
export function colorClasses(values, ramp, {unknown, tickFormat, label} = {}) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort(d3.ascending);
  const breaks = [...new Set([0.2, 0.4, 0.6, 0.8].map((p) => d3.quantileSorted(sorted, p)))]
    .filter((t) => t > sorted[0]);
  const step = (ramp.length - 1) / Math.max(1, breaks.length);
  const range = d3.range(breaks.length + 1).map((i) => ramp[Math.round(i * step)]);
  return {type: "threshold", domain: breaks.length ? breaks : [sorted[0] ?? 0], range: breaks.length ? range : [ramp[0], ramp[ramp.length - 1]],
    unknown, tickFormat, label, legend: true};
}

let patternId = 0;

/**
 * features: GeoJSON features with properties.council
 * row(council) -> {value, suppressed, title} | undefined
 */
export function choropleth(features, {row, color, width, height, selected, ink, onSelect, domain, legend = false, label}) {
  const id = `hatch-${++patternId}`;
  const suppressed = features.filter((f) => row(f.properties.council)?.suppressed);
  const fig = Plot.plot({
    width, height,
    margin: 0, marginTop: legend ? 4 : 0,
    projection: projection(domain ?? features),
    color: {...color, legend: false},
    marks: [
      () => svg`<defs><pattern id=${id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill=${ink.noData}></rect><line x1="0" y1="0" x2="0" y2="6" stroke=${ink.hatch} stroke-width="1.5"></line></pattern></defs>`,
      Plot.geo(features, {fill: (f) => row(f.properties.council)?.value ?? NaN, stroke: ink.surface, strokeWidth: 0.6}),
      Plot.geo(suppressed, {fill: `url(#${id})`, stroke: ink.surface, strokeWidth: 0.6}),
      Plot.geo(features.filter((f) => f.properties.council === selected), {stroke: ink.selected, strokeWidth: 2}),
      Plot.tip(features, Plot.pointer(Plot.geoCentroid({
        title: (f) => row(f.properties.council)?.title ?? f.properties.council, fontSize: 12
      })))
    ]
  });
  fig.setAttribute("aria-label", label ?? "Map of New Zealand councils");
  if (onSelect) {
    fig.style.cursor = "pointer";
    fig.addEventListener("click", () => {
      if (fig.value) onSelect(fig.value.properties.council);
    });
  }
  return fig;
}

export function legend(color, {width = 320} = {}) {
  return Plot.legend({color: {...color}, width, marginLeft: 0});
}
