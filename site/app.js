// Renders site/data/datasets.json (built by scripts/build_data.py) as a
// filterable horizontal bar chart, summary tiles and a table.
(function () {
  "use strict";

  const PAGE_SIZE = 25;
  const fmt = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 2 });
  const $ = (id) => document.getElementById(id);
  const el = {
    dataset: $("dataset"), measure: $("measure"), sort: $("sort"), search: $("search"),
    tiles: $("tiles"), title: $("chart-title"), notes: $("notes"), footnotes: $("footnotes"),
    chart: $("chart"), table: $("table"), more: $("more"), empty: $("empty"),
    tooltip: $("tooltip"), source: $("source"),
  };
  const state = { data: null, ds: null, measure: null, view: "chart", showAll: false };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const display = (v) => (v === null || v === undefined ? "–" : isNum(v) ? fmt.format(v) : String(v));

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    return { ds: p.get("ds"), m: p.get("m") };
  }
  function writeHash() {
    const p = new URLSearchParams({ ds: state.ds.id, m: state.measure });
    history.replaceState(null, "", "#" + p.toString());
  }

  function selectDataset(id, measure) {
    const list = state.data.datasets;
    state.ds = list.find((d) => d.id === id) || list[0];
    el.dataset.value = state.ds.id;
    el.measure.innerHTML = state.ds.measures
      .map((m) => `<option>${escapeHtml(m)}</option>`).join("");
    state.measure = state.ds.measures.includes(measure) ? measure : state.ds.measures[0];
    el.measure.value = state.measure;
    el.notes.textContent = state.ds.notes.join(" · ");
    el.footnotes.textContent = state.ds.footnotes.join(" ");
    state.showAll = false;
    render();
  }

  function visibleRows() {
    const q = el.search.value.trim().toLowerCase();
    const { label, dimensions } = state.ds;
    let rows = state.ds.rows.filter((r) => !q || dimensions.some(
      (d) => r[d] !== null && String(r[d]).toLowerCase().includes(q)));
    const m = state.measure;
    const sort = el.sort.value;
    rows = rows.slice().sort((a, b) => {
      if (a._total !== b._total) return a._total ? 1 : -1; // totals last
      if (sort === "name") return String(a[label]).localeCompare(String(b[label]));
      const av = isNum(a[m]) ? a[m] : -Infinity;
      const bv = isNum(b[m]) ? b[m] : -Infinity;
      return sort === "asc" ? av - bv : bv - av;
    });
    return rows;
  }

  function render() {
    const rows = visibleRows();
    const m = state.measure;
    el.title.textContent = `${m} by ${state.ds.label.toLowerCase()}`;
    writeHash();
    renderTiles(rows);
    const chartRows = rows.filter((r) => !r._total && isNum(r[m]));
    if (state.view === "chart") renderChart(chartRows);
    else renderTable(rows);
    const limited = state.view === "chart" && chartRows.length > PAGE_SIZE;
    el.more.hidden = !limited;
    el.more.textContent = state.showAll ? "Show top " + PAGE_SIZE : `Show all ${chartRows.length}`;
  }

  function renderTiles(rows) {
    const m = state.measure;
    const items = rows.filter((r) => !r._total && isNum(r[m]));
    const totalRow = rows.find((r) => r._total && isNum(r[m]));
    const sum = items.reduce((s, r) => s + r[m], 0);
    const top = items.reduce((best, r) => (!best || r[m] > best[m] ? r : best), null);
    const tiles = [
      { label: totalRow ? `${m} (published total)` : `${m} (sum of rows shown)`,
        value: display(totalRow ? totalRow[m] : sum) },
      { label: "Rows with a value", value: fmt.format(items.length),
        sub: `${state.ds.label}` },
    ];
    if (top) tiles.push({ label: "Highest", value: display(top[m]), sub: String(top[state.ds.label]) });
    el.tiles.innerHTML = tiles.map((t) => `<div class="tile"><div class="label">${escapeHtml(t.label)}</div>
      <div class="value">${escapeHtml(t.value)}</div>${t.sub ? `<div class="sub">${escapeHtml(t.sub)}</div>` : ""}</div>`).join("");
  }

  // Round tick step (1, 2, 2.5 or 5 x 10^n) giving about `count` intervals.
  function niceStep(span, count) {
    if (span <= 0) return 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) * mag;
  }

  function renderChart(rows) {
    const m = state.measure;
    const label = state.ds.label;
    const shown = state.showAll ? rows : rows.slice(0, PAGE_SIZE);
    if (!shown.length) {
      el.chart.innerHTML = `<p class="notes">No rows match.</p>`;
      return;
    }
    const width = Math.max(320, el.chart.clientWidth || 800);
    const labelW = Math.min(220, Math.round(width * 0.36));
    const valueW = width < 520 ? 52 : 64;
    const rowH = 24, barH = 16, top = 22;
    const plotW = width - labelW - valueW;
    const tickCount = width < 520 ? 2 : 4;
    const lo = Math.min(0, ...shown.map((r) => r[m]));
    const hi = Math.max(0, ...shown.map((r) => r[m]));
    const step = niceStep(hi - lo, tickCount);
    const min = Math.floor(lo / step) * step;
    const max = Math.max(min + step, Math.ceil(hi / step) * step);
    const x = (v) => labelW + ((v - min) / (max - min)) * plotW;
    const height = top + shown.length * rowH + 4;
    const ticks = [];
    for (let t = min; t <= max + step / 2; t += step) ticks.push(t);
    const tickFmt = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });
    const maxChars = Math.max(8, Math.floor(labelW / 6.6));
    const truncate = (s) => (s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(el.title.textContent)}">`;
    ticks.forEach((t) => {
      svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${height}"/>` +
        `<text x="${x(t)}" y="12" text-anchor="middle">${tickFmt.format(t)}</text>`;
    });
    shown.forEach((r, i) => {
      const y = top + i * rowH;
      const v = r[m];
      const x0 = x(Math.min(0, v)), x1 = x(Math.max(0, v));
      const w = Math.max(1, x1 - x0);
      const name = String(r[label] ?? "");
      svg += `<g class="row" tabindex="0" data-i="${i}">` +
        `<rect class="hit" x="0" y="${y}" width="${width}" height="${rowH}"/>` +
        `<text x="${labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end">${escapeHtml(truncate(name))}</text>` +
        `<rect class="bar" x="${x0}" y="${y + (rowH - barH) / 2}" width="${w}" height="${barH}" rx="${Math.min(4, w / 2)}"/>` +
        `<text class="value-label" x="${x1 + 6}" y="${y + rowH / 2 + 4}">${display(v)}</text></g>`;
    });
    svg += `<line class="baseline" x1="${x(0)}" x2="${x(0)}" y1="${top - 4}" y2="${height}"/></svg>`;
    el.chart.innerHTML = svg;

    const total = rows.reduce((s, r) => s + r[m], 0);
    el.chart.querySelectorAll(".row").forEach((g) => {
      const r = shown[Number(g.dataset.i)];
      const show = (evt) => {
        const share = total ? ` · ${(100 * r[m] / total).toFixed(1)}% of rows shown` : "";
        const extra = state.ds.dimensions.filter((d) => d !== label && r[d] !== null)
          .map((d) => `<div class="muted">${escapeHtml(d)}: ${escapeHtml(r[d])}</div>`).join("");
        el.tooltip.innerHTML = `<strong>${escapeHtml(r[label])}</strong>${escapeHtml(m)}: ${display(r[m])}` +
          `<div class="muted">Rank ${rows.indexOf(r) + 1} of ${rows.length}${share}</div>${extra}`;
        el.tooltip.hidden = false;
        const box = g.getBoundingClientRect();
        const px = evt && evt.clientX ? evt.clientX : box.left + labelW;
        const tw = el.tooltip.offsetWidth;
        el.tooltip.style.left = Math.min(window.innerWidth - tw - 8, px + 12) + "px";
        el.tooltip.style.top = (box.bottom + 6) + "px";
      };
      g.addEventListener("mousemove", show);
      g.addEventListener("focus", show);
      g.addEventListener("mouseleave", hideTooltip);
      g.addEventListener("blur", hideTooltip);
    });
  }

  function hideTooltip() { el.tooltip.hidden = true; }

  function renderTable(rows) {
    const cols = state.ds.columns;
    const numeric = new Set(state.ds.measures);
    const head = cols.map((c) => `<th class="${numeric.has(c) ? "num" : ""}">${escapeHtml(c)}</th>`).join("");
    const body = rows.map((r) => `<tr class="${r._total ? "total" : ""}">` + cols.map((c) =>
      `<td class="${numeric.has(c) ? "num" : ""}">${escapeHtml(display(r[c]))}</td>`).join("") + "</tr>").join("");
    el.table.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll(".view-toggle button").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.view === view)));
    el.chart.hidden = view !== "chart";
    el.table.hidden = view !== "table";
    hideTooltip();
    render();
  }

  function init(data) {
    state.data = data;
    if (!data.datasets.length) {
      document.querySelectorAll("#app > section:not(#empty)").forEach((s) => (s.hidden = true));
      el.empty.hidden = false;
      return;
    }
    el.dataset.innerHTML = data.datasets.map((d) =>
      `<option value="${escapeHtml(d.id)}">${escapeHtml(d.sheet)}</option>`).join("");
    el.source.textContent = `Source: ${data.files.join(", ")} (MCERT). Data built ${data.generated.slice(0, 10)}.`;

    el.dataset.addEventListener("change", () => selectDataset(el.dataset.value));
    el.measure.addEventListener("change", () => { state.measure = el.measure.value; render(); });
    el.sort.addEventListener("change", render);
    el.search.addEventListener("input", render);
    el.more.addEventListener("click", () => { state.showAll = !state.showAll; render(); });
    document.querySelectorAll(".view-toggle button").forEach((b) =>
      b.addEventListener("click", () => setView(b.dataset.view)));
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => state.view === "chart" && render(), 150);
    });

    const h = readHash();
    selectDataset(h.ds, h.m);
  }

  fetch("data/datasets.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(() => init({ datasets: [], files: [], generated: "" }));
})();
