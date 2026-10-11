// Dashboard for site/data/dogs.json (built by scripts/build_data.py).
(function () {
  "use strict";

  const PAGE_SIZE = 20;
  const MAX_COMPARE = 3; // categorical slots 1-3 stay distinguishable in every pairing
  const BREED_MIN_DOGS = 100; // smaller breeds give unstable rates
  const TILE_METRICS = ["dogs", "owners", "menacing", "dangerous", "acc_claims", "prosecutions"];
  // The 2024 National Dog Database snapshot is far below the years either side.
  const SUSPECT_YEAR = 2024;
  const isSuspect = (m, year) => year === SUSPECT_YEAR && m.source.startsWith("DIA");

  const $ = (id) => document.getElementById(id);
  const el = {};
  ["area", "year", "tiles", "metric", "mode", "compare", "chips", "trend", "trend-note",
    "sort", "search", "councils", "councils-table", "councils-more", "councils-note",
    "breed-metric", "breed-mode", "breed-groups", "breeds", "breeds-more", "breeds-note",
    "about", "source", "tooltip", "empty", "glance-title", "trend-title", "councils-title",
    "breeds-title"].forEach((id) => (el[id] = $(id)));

  const state = {
    area: 0, year: null, metric: "menacing", mode: "count", compare: [],
    councilView: "chart", councilsAll: false, breedMetric: "dogs", breedMode: "count",
    breedGroups: false, breedsAll: false,
  };
  let D = null; // the dataset
  let metricById = {};

  // ---------- formatting ----------
  const nf0 = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nzd = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  // A "measure" is a metric plus a display mode; it knows how to read and format values.
  function measure(metricId, mode) {
    const m = metricById[metricId];
    const rate = mode === "rate" && m.rate ? m.rate : null;
    return {
      metric: m,
      rate,
      label: rate === "pct" ? `${m.label} (% of registered dogs)`
        : rate === "per1000" ? `${m.label} per 1,000 registered dogs` : m.label,
      value(area, yi) {
        const v = D.values[m.id][area][yi];
        if (!isNum(v)) return null;
        if (!rate) return v;
        const dogs = D.values.dogs[area][yi];
        if (!isNum(dogs) || dogs <= 0) return null;
        return rate === "pct" ? (100 * v) / dogs : (1000 * v) / dogs;
      },
      format(v) {
        if (!isNum(v)) return "–";
        if (rate === "pct") return nf1.format(v) + "%";
        if (rate) return nf1.format(v);
        return m.unit === "nzd" ? nzd.format(v) : nf0.format(v);
      },
      tick(v) {
        if (rate === "pct") return nf0.format(v) + "%";
        if (rate) return Number.isInteger(v) ? nf0.format(v) : nf1.format(v);
        return (m.unit === "nzd" ? "$" : "") + compact.format(v);
      },
    };
  }

  const yearIndex = (y) => D.years.indexOf(y);
  const areaName = (i) => D.areas[i].name;
  const councilIdx = () => D.areas.map((a, i) => i).filter((i) => D.areas[i].type === "council");

  function suppressedMarker(metricId, area, year) {
    const hit = D.suppressed.find((s) => s[0] === metricId && s[1] === area && s[2] === year);
    return hit ? hit[3] : null;
  }

  // ---------- tooltip ----------
  function showTip(html, x, y) {
    el.tooltip.innerHTML = html;
    el.tooltip.hidden = false;
    const w = el.tooltip.offsetWidth, h = el.tooltip.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14));
    const top = y + h + 20 > window.innerHeight ? y - h - 12 : y + 14;
    el.tooltip.style.left = left + "px";
    el.tooltip.style.top = Math.max(8, top) + "px";
  }
  const hideTip = () => (el.tooltip.hidden = true);

  // ---------- scales ----------
  function niceStep(span, count) {
    if (span <= 0) return 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) * mag;
  }
  function niceDomain(lo, hi, count) {
    lo = Math.min(0, lo); hi = Math.max(0, hi);
    const step = niceStep(hi - lo, count);
    const min = Math.floor(lo / step) * step;
    const max = Math.max(min + step, Math.ceil(hi / step - 1e-9) * step);
    const ticks = [];
    for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
    return { min, max, ticks };
  }

  // ---------- horizontal bar chart ----------
  // rows: [{label, value, cls, tip, onClick}]
  function barChart(container, rows, fmt, opts = {}) {
    if (!rows.length) {
      container.innerHTML = `<p class="notes">No data for this selection.</p>`;
      return;
    }
    const width = Math.max(300, container.clientWidth || 800);
    const narrow = width < 520;
    const labelW = Math.min(230, Math.round(width * (narrow ? 0.38 : 0.3)));
    const valueW = narrow ? 56 : 80;
    const rowH = 24, barH = 16, top = 22;
    const plotW = width - labelW - valueW;
    const vals = rows.map((r) => r.value);
    const { min, max, ticks } = niceDomain(Math.min(...vals), Math.max(...vals), narrow ? 2 : 4);
    const x = (v) => labelW + ((v - min) / (max - min)) * plotW;
    const height = top + rows.length * rowH + 4;
    const maxChars = Math.max(8, Math.floor(labelW / 6.8));
    const trunc = (s) => (s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.title || "")}">`;
    ticks.forEach((t) => {
      svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${height}"/>` +
        `<text x="${x(t)}" y="12" text-anchor="middle">${esc(fmt.tick(t))}</text>`;
    });
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const x0 = x(Math.min(0, r.value)), x1 = x(Math.max(0, r.value));
      const w = Math.max(1, x1 - x0);
      svg += `<g class="row${r.cls ? " " + r.cls : ""}${r.onClick ? " clickable" : ""}" tabindex="0" data-i="${i}">` +
        `<rect class="hit" x="0" y="${y}" width="${width}" height="${rowH}"/>` +
        `<text class="row-label" x="${labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(trunc(r.label))}</text>` +
        `<rect class="bar" x="${x0}" y="${y + (rowH - barH) / 2}" width="${w}" height="${barH}" rx="${Math.min(4, w / 2)}"/>` +
        `<text class="value-label" x="${x1 + 6}" y="${y + rowH / 2 + 4}">${esc(fmt.format(r.value))}</text></g>`;
    });
    svg += `<line class="baseline" x1="${x(0)}" x2="${x(0)}" y1="${top - 4}" y2="${height}"/></svg>`;
    container.innerHTML = svg;

    container.querySelectorAll(".row").forEach((g) => {
      const r = rows[Number(g.dataset.i)];
      const tip = (evt) => {
        const box = g.getBoundingClientRect();
        showTip(r.tip, evt && evt.clientX ? evt.clientX : box.left + labelW, box.top + rowH / 2);
      };
      g.addEventListener("mousemove", tip);
      g.addEventListener("focus", tip);
      g.addEventListener("mouseleave", hideTip);
      g.addEventListener("blur", hideTip);
      if (r.onClick) {
        g.addEventListener("click", r.onClick);
        g.addEventListener("keydown", (e) => { if (e.key === "Enter") r.onClick(); });
      }
    });
  }

  // ---------- line chart ----------
  // series: [{name, slot, values: [..per year]}], years: [..]
  function lineChart(container, series, years, fmt, opts = {}) {
    const width = Math.max(300, container.clientWidth || 800);
    const narrow = width < 520;
    const height = narrow ? 240 : 300;
    const pad = { top: 16, right: narrow ? 16 : 120, bottom: 28, left: narrow ? 48 : 64 };
    const all = series.flatMap((s) => s.values.filter(isNum));
    if (!all.length) {
      container.innerHTML = `<p class="notes">No data for this selection.</p>`;
      return;
    }
    const { min, max, ticks } = niceDomain(Math.min(...all), Math.max(...all), 4);
    const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    const x = (i) => pad.left + (years.length === 1 ? plotW / 2 : (i / (years.length - 1)) * plotW);
    const y = (v) => pad.top + plotH - ((v - min) / (max - min)) * plotH;
    const step = Math.ceil(years.length / (narrow ? 5 : 13));

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.title || "")}">`;
    ticks.forEach((t) => {
      svg += `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/>` +
        `<text x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end">${esc(fmt.tick(t))}</text>`;
    });
    years.forEach((yr, i) => {
      if (i % step === 0 || i === years.length - 1) {
        svg += `<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${yr}</text>`;
      }
    });
    svg += `<line class="baseline" x1="${pad.left}" x2="${width - pad.right}" y1="${y(Math.max(min, 0))}" y2="${y(Math.max(min, 0))}"/>`;
    if (opts.markYear != null) {
      const mi = years.indexOf(opts.markYear);
      if (mi >= 0) svg += `<line class="year-mark" x1="${x(mi)}" x2="${x(mi)}" y1="${pad.top}" y2="${pad.top + plotH}"/>`;
    }
    svg += `<line class="crosshair" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + plotH}" visibility="hidden"/>`;

    const endLabels = [];
    series.forEach((s) => {
      // Break the line at gaps rather than bridging missing years.
      let d = "", pen = false;
      s.values.forEach((v, i) => {
        if (isNum(v)) { d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }
        else pen = false;
      });
      svg += `<path class="line s${s.slot}" d="${d}"/>`;
      s.values.forEach((v, i) => {
        const lone = isNum(v) && !isNum(s.values[i - 1]) && !isNum(s.values[i + 1]);
        if (lone) svg += `<circle class="pt s${s.slot}" cx="${x(i)}" cy="${y(v)}" r="4"/>`;
      });
      let last = s.values.length - 1;
      while (last >= 0 && !isNum(s.values[last])) last--;
      if (last >= 0) endLabels.push({ s, i: last, y: y(s.values[last]) });
    });
    // Direct end labels on wide screens, nudged apart so they don't collide.
    if (!narrow) {
      endLabels.sort((a, b) => a.y - b.y);
      for (let k = 1; k < endLabels.length; k++) {
        endLabels[k].y = Math.max(endLabels[k].y, endLabels[k - 1].y + 14);
      }
      endLabels.forEach((l) => {
        const name = l.s.name.length > 16 ? l.s.name.slice(0, 15) + "…" : l.s.name;
        svg += `<text class="end-label" x="${x(l.i) + 8}" y="${l.y + 4}">${esc(name)}</text>`;
      });
    }
    svg += `<g class="hover-dots"></g>`;
    svg += `<rect class="hit" x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}"/></svg>`;
    container.innerHTML = svg;

    const svgEl = container.querySelector("svg");
    const cross = svgEl.querySelector(".crosshair");
    const dots = svgEl.querySelector(".hover-dots");
    const hit = svgEl.querySelector(".hit");
    const onMove = (evt) => {
      const rect = svgEl.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * width;
      const i = Math.max(0, Math.min(years.length - 1,
        Math.round(((px - pad.left) / plotW) * (years.length - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      cross.setAttribute("visibility", "visible");
      dots.innerHTML = series.map((s) => isNum(s.values[i])
        ? `<circle class="pt s${s.slot}" cx="${x(i)}" cy="${y(s.values[i])}" r="4"/>` : "").join("");
      const rows = series.map((s) => `<div class="tip-row"><span class="key s${s.slot}"></span>` +
        `${esc(s.name)}<b>${esc(isNum(s.values[i]) ? fmt.format(s.values[i]) : (s.note && s.note(i)) || "no data")}</b></div>`).join("");
      showTip(`<strong>Year ending June ${years[i]}</strong>${rows}`, evt.clientX, evt.clientY);
    };
    hit.addEventListener("mousemove", onMove);
    hit.addEventListener("mouseleave", () => {
      cross.setAttribute("visibility", "hidden"); dots.innerHTML = ""; hideTip();
    });
  }

  // ---------- sections ----------
  function renderTiles() {
    const yi = yearIndex(state.year);
    el["glance-title"].textContent = `At a glance: ${areaName(state.area)}, year to June ${state.year}`;
    el.tiles.innerHTML = TILE_METRICS.filter((id) => metricById[id]).map((id) => {
      const m = metricById[id];
      const count = measure(id, "count");
      const v = count.value(state.area, yi);
      let pi = yi - 1;
      if (pi >= 0 && isSuspect(m, D.years[pi])) pi--; // don't compare against the 2024 snapshot
      const prev = pi >= 0 ? count.value(state.area, pi) : null;
      let sub = "";
      if (m.rate && isNum(v)) {
        const r = measure(id, "rate");
        sub = `${r.format(r.value(state.area, yi))} per 1,000 dogs`;
      }
      let delta = "";
      if (isSuspect(m, state.year)) {
        delta = "2024 snapshot: see notes";
      } else if (isNum(v) && isNum(prev) && prev !== 0) {
        const pct = (100 * (v - prev)) / prev;
        delta = `${pct >= 0 ? "▲" : "▼"} ${nf1.format(Math.abs(pct))}% on ${D.years[pi]}`;
      }
      const marker = suppressedMarker(id, state.area, state.year);
      const value = isNum(v) ? count.format(v) : marker ? `${marker}` : "–";
      return `<button type="button" class="tile${state.metric === id ? " active" : ""}" data-metric="${id}">
        <div class="label">${esc(m.label)}</div>
        <div class="value">${esc(value)}</div>
        <div class="sub">${esc(sub)}${sub && delta ? " · " : ""}${esc(delta)}</div></button>`;
    }).join("");
    el.tiles.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => {
      state.metric = t.dataset.metric;
      el.metric.value = state.metric;
      renderAll();
      $("trend-title").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function renderTrend() {
    const fmt = measure(state.metric, state.mode);
    const [y0, y1] = fmt.metric.years;
    const years = D.years.filter((y) => y >= y0 && y <= y1);
    const areas = [state.area, ...state.compare.filter((a) => a !== state.area)].slice(0, MAX_COMPARE);
    const series = areas.map((a, k) => ({
      name: areaName(a),
      slot: k + 1,
      values: years.map((y) => fmt.value(a, yearIndex(y))),
      note: (i) => suppressedMarker(state.metric, a, years[i]) && `suppressed (${suppressedMarker(state.metric, a, years[i])})`,
    }));
    el["trend-title"].textContent = fmt.label;
    lineChart(el.trend, series, years, fmt, { title: fmt.label, markYear: state.year });

    el.chips.innerHTML = series.map((s, k) => `<span class="chip"><span class="key s${s.slot}"></span>${esc(s.name)}` +
      (k > 0 ? ` <button type="button" aria-label="Remove ${esc(s.name)}" data-a="${areas[k]}">×</button>` : "") + `</span>`).join("");
    el.chips.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      state.compare = state.compare.filter((a) => a !== Number(b.dataset.a));
      renderTrend();
    }));
    el.compare.disabled = areas.length >= MAX_COMPARE;
    el.mode.querySelector('option[value="rate"]').disabled = !fmt.metric.rate;
    el.mode.querySelector('option[value="rate"]').textContent =
      fmt.metric.rate === "pct" ? "% of registered dogs" : fmt.metric.rate ? "Per 1,000 registered dogs" : "Rate (n/a)";

    const notes = [`Source: ${fmt.metric.source}.`];
    if (y0 <= SUSPECT_YEAR && y1 >= SUSPECT_YEAR && isSuspect(fmt.metric, SUSPECT_YEAR)) {
      notes.push("The 2024 snapshot is much lower than the years either side for most councils; treat 2024 with caution.");
    }
    if (fmt.metric.id === "acc_paid_any") notes.push("Values for 2001–2005 are recorded as 0 in the source.");
    el["trend-note"].textContent = notes.join(" ");
  }

  function councilRows() {
    const fmt = measure(state.metric, state.mode);
    const yi = yearIndex(state.year);
    const q = el.search.value.trim().toLowerCase();
    let rows = councilIdx()
      .filter((a) => !q || areaName(a).toLowerCase().includes(q))
      .map((a) => ({ a, v: fmt.value(a, yi) }))
      .filter((r) => isNum(r.v));
    const sort = el.sort.value;
    rows.sort((p, q2) => sort === "name" ? areaName(p.a).localeCompare(areaName(q2.a))
      : sort === "asc" ? p.v - q2.v : q2.v - p.v);
    return { fmt, rows, yi };
  }

  function renderCouncils() {
    const { fmt, rows, yi } = councilRows();
    el["councils-title"].textContent = `${fmt.label}, by council, ${state.year}`;
    const missing = councilIdx().length - rows.length;
    el["councils-note"].textContent = [
      "Click a council to select it. The selected area is shown in orange.",
      missing > 0 && !el.search.value ? `${missing} councils have no value for ${state.year}.` : "",
    ].filter(Boolean).join(" ");
    const all = state.councilsAll || el.search.value.trim();
    const shown = all ? rows : rows.slice(0, PAGE_SIZE);
    const dogsFmt = measure("dogs", "count");
    const countFmt = measure(state.metric, "count");
    const rank = new Map(rows.map((r, i) => [r.a, i + 1]));

    if (state.councilView === "chart") {
      barChart(el.councils, shown.map((r) => ({
        label: areaName(r.a), value: r.v, cls: r.a === state.area ? "hl" : "",
        tip: `<strong>${esc(areaName(r.a))}</strong>${esc(fmt.label)}: <b>${esc(fmt.format(r.v))}</b>` +
          (fmt.rate ? `<div class="muted">${esc(countFmt.format(countFmt.value(r.a, yi)))} of ${esc(dogsFmt.format(dogsFmt.value(r.a, yi)))} registered dogs</div>` : "") +
          (el.sort.value !== "name" ? `<div class="muted">Rank ${rank.get(r.a)} of ${rows.length}</div>` : ""),
        onClick: () => setArea(r.a),
      })), fmt, { title: el["councils-title"].textContent });
    } else {
      const ids = D.metrics.filter((m) => m.years[0] <= state.year && m.years[1] >= state.year).map((m) => m.id);
      const head = `<th>Council</th>` + ids.map((id) => `<th class="num">${esc(metricById[id].label)}</th>`).join("");
      const body = rows.map((r) => `<tr class="${r.a === state.area ? "hl" : ""}"><td>${esc(areaName(r.a))}</td>` +
        ids.map((id) => {
          const c = measure(id, "count");
          const v = c.value(r.a, yi);
          return `<td class="num">${esc(isNum(v) ? c.format(v) : suppressedMarker(id, r.a, state.year) || "–")}</td>`;
        }).join("") + "</tr>").join("");
      el["councils-table"].innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    el.councils.hidden = state.councilView !== "chart";
    el["councils-table"].hidden = state.councilView !== "table";
    const more = el["councils-more"];
    more.hidden = state.councilView !== "chart" || el.search.value.trim() || rows.length <= PAGE_SIZE;
    more.textContent = state.councilsAll ? `Show top ${PAGE_SIZE}` : `Show all ${rows.length} councils`;
  }

  function renderBreeds() {
    const B = D.breeds;
    const bi = B.years.indexOf(state.year);
    const item = state.breedMetric;
    const m = metricById[item];
    const rateKind = state.breedMode === "rate" && item !== "dogs" ? (m.rate || "pct") : null;
    const rateWord = rateKind === "pct" ? "% of the breed" : "per 1,000 of the breed";
    const title = rateKind ? `${m.label} ${rateKind === "pct" ? "(% of each breed)" : "per 1,000 dogs of each breed"}`
      : `${item === "dogs" ? "Registered dogs" : m.label} by breed`;
    el["breeds-title"].textContent = `${title}, ${areaName(state.area)}, ${state.year}`;
    el["breed-mode"].querySelector('option[value="rate"]').disabled = item === "dogs";
    if (bi < 0) {
      el.breeds.innerHTML = `<p class="notes">Breed data covers ${B.years[0]}–${B.years[B.years.length - 1]}.</p>`;
      el["breeds-more"].hidden = true;
      el["breeds-note"].textContent = "";
      return;
    }
    const fmt = {
      format: (v) => !isNum(v) ? "–" : rateKind === "pct" ? nf1.format(v) + "%" : rateKind ? nf1.format(v) : nf0.format(v),
      tick: (v) => rateKind === "pct" ? nf0.format(v) + "%" : rateKind ? (Number.isInteger(v) ? nf0.format(v) : nf1.format(v)) : compact.format(v),
    };
    let skipped = 0;
    const rows = [];
    B.names.forEach((name, b) => {
      const kind = B.kinds[b];
      if (kind === "all" || (!state.breedGroups && kind !== "breed")) return;
      const count = B.values[item][b][state.area][bi];
      const total = B.values.dogs[b][state.area][bi];
      if (!isNum(count)) return;
      let v = count;
      if (rateKind) {
        if (!isNum(total) || total < BREED_MIN_DOGS) { skipped++; return; }
        v = rateKind === "pct" ? (100 * count) / total : (1000 * count) / total;
      }
      rows.push({
        label: name, value: v, cls: kind !== "breed" ? "group" : "",
        tip: `<strong>${esc(name)}</strong>${esc(m.label)}: <b>${esc(nf0.format(count))}</b>` +
          (rateKind ? `<div class="muted">${esc(fmt.format(v))} ${rateWord} (${esc(nf0.format(total))} registered)</div>` : ""),
      });
    });
    rows.sort((p, q) => q.value - p.value);
    const shown = state.breedsAll ? rows : rows.slice(0, PAGE_SIZE);
    barChart(el.breeds, shown, fmt, { title });
    const more = el["breeds-more"];
    more.hidden = rows.length <= PAGE_SIZE;
    more.textContent = state.breedsAll ? `Show top ${PAGE_SIZE}` : `Show all ${rows.length}`;

    const allPure = B.values[item][B.kinds.indexOf("all")]?.[state.area]?.[bi];
    const notes = ["MCERT lists 34 named pure breeds; all others are grouped as “other pure breeds”."];
    if (isNum(allPure)) notes.unshift(`All pure breeds: ${nf0.format(allPure)}.`);
    if (state.breedGroups) notes.push("Group totals are shown in grey.");
    if (item === "menacing") {
      notes.push("The American Pit Bull Terrier, Brazilian Fila, Dogo Argentino, Japanese Tosa and " +
        "Perro de Presa Canario are listed in Schedule 4 of the Dog Control Act 1996 and must be classified as menacing because of their breed.");
    }
    if (skipped) notes.push(`${skipped} breed${skipped > 1 ? "s" : ""} with fewer than ${BREED_MIN_DOGS} registered dogs hidden from the rate view.`);
    el["breeds-note"].textContent = notes.join(" ");
  }

  function renderAbout() {
    const s = D.source;
    const items = [
      `Data: <a href="${esc(s.url)}">${esc(s.publisher)} dog control statistics</a> (${esc(s.file)}), licensed under ${esc(s.licence)}. Figures combine the DIA National Dog Database, the Ministry of Justice and ACC.`,
      "Years are financial years ending 30 June. National Dog Database figures are a snapshot taken each June/July.",
      "Registered-dog, owner and breed figures start in 2013; Ministry of Justice and ACC claim counts in 2016; ACC payment totals run 2001–2018.",
      "The 2024 National Dog Database snapshot is far lower than the years either side for almost every council (e.g. 429,000 registered dogs nationally against 587,000 in 2023 and 578,000 in 2025). These are the published figures, but treat 2024 with caution.",
      "Small ACC claim counts are suppressed in the source (shown as “..” or “<4”).",
      "Rates are calculated here: counts divided by the number of registered dogs in the same council and year.",
      "Ministry of Justice rows for 2023–2025 are labelled “Dog Control Act 1997/1998/1999” in the source; there are no such Acts, so they are treated as the Dog Control Act 1996.",
    ];
    el.about.innerHTML = items.map((t) => `<li>${t}</li>`).join("");
    el.source.innerHTML = `Source: ${esc(s.publisher)}, ${esc(s.file)}. ${esc(s.licence)}.`;
  }

  function writeHash() {
    const p = new URLSearchParams({ area: areaName(state.area), year: state.year, m: state.metric, mode: state.mode });
    if (state.compare.length) p.set("cmp", state.compare.map(areaName).join("|"));
    history.replaceState(null, "", "#" + p.toString());
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const find = (n) => D.areas.findIndex((a) => a.name === n);
    if (find(p.get("area")) >= 0) state.area = find(p.get("area"));
    if (D.years.includes(Number(p.get("year")))) state.year = Number(p.get("year"));
    if (metricById[p.get("m")]) state.metric = p.get("m");
    if (p.get("mode") === "rate") state.mode = "rate";
    if (p.get("cmp")) state.compare = p.get("cmp").split("|").map(find).filter((i) => i >= 0);
  }

  function setArea(a) {
    state.area = a;
    state.compare = state.compare.filter((c) => c !== a);
    el.area.value = a;
    renderAll();
  }

  function renderAll() {
    if (!metricById[state.metric].rate) state.mode = "count";
    el.mode.value = state.mode;
    renderTiles();
    renderTrend();
    renderCouncils();
    renderBreeds();
    writeHash();
  }

  function fillSelects() {
    const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
    const groups = (filter) => {
      const out = {};
      D.areas.forEach((a, i) => { if (filter(a)) (out[a.type === "council" ? "Councils" : "New Zealand"] ||= []).push(opt(i, a.name)); });
      return Object.entries(out).map(([g, o]) => `<optgroup label="${g}">${o.join("")}</optgroup>`).join("");
    };
    el.area.innerHTML = groups(() => true);
    el.compare.innerHTML = opt("", "Add an area…") + groups(() => true);
    // Most recent year with registered-dog data first.
    const dogYears = D.years.filter((y) => metricById.dogs && y >= metricById.dogs.years[0]);
    el.year.innerHTML = D.years.slice().reverse().map((y) => opt(y, y)).join("");
    state.year = dogYears.length ? dogYears[dogYears.length - 1] : D.years[D.years.length - 1];
    const byGroup = {};
    D.metrics.forEach((m) => (byGroup[m.group] ||= []).push(opt(m.id, m.label)));
    el.metric.innerHTML = Object.entries(byGroup).map(([g, o]) => `<optgroup label="${esc(g)}">${o.join("")}</optgroup>`).join("");
    el["breed-metric"].innerHTML = Object.keys(D.breeds.values).map((id) =>
      opt(id, id === "dogs" ? "Registered dogs" : metricById[id].label)).join("");
  }

  function bind() {
    el.area.addEventListener("change", () => setArea(Number(el.area.value)));
    el.year.addEventListener("change", () => { state.year = Number(el.year.value); renderAll(); });
    el.metric.addEventListener("change", () => { state.metric = el.metric.value; state.councilsAll = false; renderAll(); });
    el.mode.addEventListener("change", () => { state.mode = el.mode.value; renderAll(); });
    el.compare.addEventListener("change", () => {
      const a = Number(el.compare.value);
      if (el.compare.value !== "" && a !== state.area && !state.compare.includes(a)) state.compare.push(a);
      el.compare.value = "";
      renderTrend(); writeHash();
    });
    el.sort.addEventListener("change", renderCouncils);
    el.search.addEventListener("input", renderCouncils);
    el["councils-more"].addEventListener("click", () => { state.councilsAll = !state.councilsAll; renderCouncils(); });
    el["breeds-more"].addEventListener("click", () => { state.breedsAll = !state.breedsAll; renderBreeds(); });
    el["breed-metric"].addEventListener("change", () => {
      state.breedMetric = el["breed-metric"].value;
      if (state.breedMetric === "dogs") { state.breedMode = "count"; el["breed-mode"].value = "count"; }
      renderBreeds();
    });
    el["breed-mode"].addEventListener("change", () => { state.breedMode = el["breed-mode"].value; renderBreeds(); });
    el["breed-groups"].addEventListener("change", () => { state.breedGroups = el["breed-groups"].checked; renderBreeds(); });
    document.querySelectorAll(".view-toggle button").forEach((b) => b.addEventListener("click", () => {
      state.councilView = b.dataset.view;
      b.parentElement.querySelectorAll("button").forEach((o) => o.setAttribute("aria-selected", String(o === b)));
      hideTip();
      renderCouncils();
    }));
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(renderAll, 150); });
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  function init(data) {
    D = data;
    metricById = Object.fromEntries(D.metrics.map((m) => [m.id, m]));
    fillSelects();
    readHash();
    el.area.value = state.area;
    el.year.value = state.year;
    el.metric.value = state.metric;
    el["breed-metric"].value = state.breedMetric;
    bind();
    renderAbout();
    renderAll();
  }

  fetch("data/dogs.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch((err) => {
      console.error(err);
      document.querySelectorAll("#app > section:not(#empty)").forEach((s) => (s.hidden = true));
      el.empty.hidden = false;
    });
})();
