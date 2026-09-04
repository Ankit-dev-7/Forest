/**
 * js/charts.js — Analytics Dashboard charts module
 * Creates and manages all 6 Chart.js instances.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 7.2, 18.2, 19.7
 *
 * NOTE: Chart (Chart.js) is a CDN global — not imported.
 *
 * NOTE: analytics.js (loaded first in main.js) claims the shared canvas IDs
 * (chart-trend, chart-loss, chart-gain, chart-composition).
 * The province chart (chart-province) no longer uses a canvas — it is a pure
 * SVG radial chart rendered into #province-radial-wrap by analytics.js.
 * Each buildXxxChart() guard-checks via Chart.getChart(canvas) and returns
 * early when a Chart.js instance already exists on the element.  This avoids
 * the "Canvas is already in use" error while preserving the year-highlight
 * EventBus subscription that prediction.js depends on.
 */

import { EventBus } from './eventbus.js';
import { formatHa, formatNumber } from './utils.js';

// ============================================================
// Guard helper — returns true when the canvas already has an owner
// ============================================================

/**
 * Check whether a canvas element already has a Chart.js instance attached.
 * Chart.getChart() is available on Chart.js ≥ 3.
 * @param {HTMLCanvasElement|null} canvas
 * @returns {boolean}
 */
function _canvasOwned(canvas) {
  if (!canvas) return true; // treat missing element as "skip"
  try {
    return !!Chart.getChart(canvas);
  } catch (_) {
    return false;
  }
}

// ============================================================
// Module-level state
// ============================================================

/** @type {object|null} Full stats object passed to init() */
let _stats = null;

/** @type {Chart|null} */
let chartTrend       = null;
/** @type {Chart|null} */
let chartLoss        = null;
/** @type {Chart|null} */
let chartProvince    = null;
/** @type {Chart|null} */
let chartDistrict    = null;
/** @type {Chart|null} */
let chartGain        = null;
/** @type {Chart|null} */
let chartComposition = null;

// Colors used for highlighted year bar/point
const HIGHLIGHT_COLOR = '#7c3aed';
const PRIMARY_GREEN   = '#16a34a';
const LOSS_RED        = '#ef4444';
const GAIN_BLUE       = '#3b82f6';

// ============================================================
// Helpers
// ============================================================

/**
 * Default Chart.js animation config.
 * @returns {object}
 */
function defaultAnimation() {
  return { duration: 1000, easing: 'easeInOutQuart' };
}

/**
 * Build a visually-hidden sibling table for a chart canvas
 * to satisfy WCAG accessibility requirements.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]}          headers
 * @param {Array<string[]>}   rows
 */
function buildAccessibilityTable(canvas, headers, rows) {
  // Remove any existing table
  const existing = canvas.parentElement.querySelector('.sr-table');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'sr-table';
  wrapper.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  rows.forEach(rowData => {
    const tr = document.createElement('tr');
    rowData.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);
  canvas.parentElement.style.position = 'relative';
  canvas.parentElement.appendChild(wrapper);
}

/**
 * Populate the year-range <select> elements from yearlyData.
 * @param {Array<{year:number}>} yearlyData
 */
function populateYearRangeSelects(yearlyData) {
  const startEl = document.getElementById('year-range-start');
  const endEl   = document.getElementById('year-range-end');
  if (!startEl || !endEl) return;

  const years = yearlyData.map(d => d.year).sort((a, b) => a - b);

  startEl.innerHTML = '';
  endEl.innerHTML   = '';

  years.forEach(y => {
    const optStart = document.createElement('option');
    optStart.value       = y;
    optStart.textContent = y;
    startEl.appendChild(optStart);

    const optEnd = document.createElement('option');
    optEnd.value       = y;
    optEnd.textContent = y;
    endEl.appendChild(optEnd);
  });

  // Default: full range
  startEl.value = years[0];
  endEl.value   = years[years.length - 1];
}

// ============================================================
// Chart builders
// ============================================================

/**
 * Chart 1 — Forest Cover Trend (Line, area fill).
 * @param {Array<{year:number, forestCoverHa:number}>} data
 * @returns {Chart}
 */
function buildTrendChart(data) {
  const canvas = document.getElementById('chart-trend');
  if (!canvas || _canvasOwned(canvas)) return null;

  const labels = data.map(d => d.year);
  const values = data.map(d => d.forestCoverHa);

  buildAccessibilityTable(
    canvas,
    ['Year', 'Forest Cover (ha)'],
    data.map(d => [d.year, formatHa(d.forestCoverHa)])
  );

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Forest Cover',
        data: values,
        borderColor: PRIMARY_GREEN,
        backgroundColor: 'rgba(22, 163, 74, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: values.map(() => PRIMARY_GREEN),
      }],
    },
    options: {
      animation: defaultAnimation(),
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: ctx => formatHa(ctx.raw),
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Forest Cover (ha)' },
          ticks: { callback: val => formatNumber(val) },
        },
      },
    },
  });
}

/**
 * Chart 2 — Annual Forest Loss (Bar).
 * @param {Array<{year:number, forestLossHa:number}>} data
 * @returns {Chart}
 */
function buildLossChart(data) {
  const canvas = document.getElementById('chart-loss');
  if (!canvas || _canvasOwned(canvas)) return null;

  const labels = data.map(d => d.year);
  const values = data.map(d => d.forestLossHa);

  buildAccessibilityTable(
    canvas,
    ['Year', 'Forest Loss (ha)'],
    data.map(d => [d.year, formatHa(d.forestLossHa)])
  );

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Forest Loss',
        data: values,
        backgroundColor: values.map(() => `${LOSS_RED}cc`),
        borderColor: LOSS_RED,
        borderWidth: 1,
      }],
    },
    options: {
      animation: defaultAnimation(),
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: { label: ctx => formatHa(ctx.raw) },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Forest Loss (ha)' },
          ticks: { callback: val => formatNumber(val) },
        },
      },
    },
  });
}

/**
 * Chart 3 — Province Comparison (Radar).
 * @param {Array<{name:string, forestCoverHa:number, forestLossHa:number, forestGainHa:number}>} provinces
 * @returns {Chart}
 */
function buildProvinceChart(provinces) {
  const canvas = document.getElementById('chart-province');
  if (!canvas || _canvasOwned(canvas)) return null;

  const labels = provinces.map(p => p.name);

  buildAccessibilityTable(
    canvas,
    ['Province', 'Forest Cover (ha)', 'Forest Loss (ha)', 'Forest Gain (ha)'],
    provinces.map(p => [p.name, formatHa(p.forestCoverHa), formatHa(p.forestLossHa), formatHa(p.forestGainHa)])
  );

  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Forest Cover (ha)',
          data: provinces.map(p => p.forestCoverHa),
          borderColor: PRIMARY_GREEN,
          backgroundColor: 'rgba(22,163,74,0.2)',
          pointBackgroundColor: PRIMARY_GREEN,
        },
        {
          label: 'Forest Loss (ha)',
          data: provinces.map(p => p.forestLossHa),
          borderColor: LOSS_RED,
          backgroundColor: 'rgba(239,68,68,0.15)',
          pointBackgroundColor: LOSS_RED,
        },
        {
          label: 'Forest Gain (ha)',
          data: provinces.map(p => p.forestGainHa),
          borderColor: GAIN_BLUE,
          backgroundColor: 'rgba(59,130,246,0.15)',
          pointBackgroundColor: GAIN_BLUE,
        },
      ],
    },
    options: {
      animation: defaultAnimation(),
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${formatHa(ctx.raw)}` },
        },
      },
    },
  });
}

/**
 * Chart 4 — Top 10 Districts by Forest Loss (Horizontal Bar).
 * @param {Array<{name:string, forestLossHa:number}>} districts
 * @returns {Chart}
 */
function buildDistrictChart(districts) {
  const canvas = document.getElementById('chart-district');
  if (!canvas || _canvasOwned(canvas)) return null;

  const top10 = [...districts]
    .sort((a, b) => b.forestLossHa - a.forestLossHa)
    .slice(0, 10);

  buildAccessibilityTable(
    canvas,
    ['District', 'Forest Loss (ha)'],
    top10.map(d => [d.name, formatHa(d.forestLossHa)])
  );

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top10.map(d => d.name),
      datasets: [{
        label: 'Forest Loss',
        data: top10.map(d => d.forestLossHa),
        backgroundColor: `${LOSS_RED}cc`,
        borderColor: LOSS_RED,
        borderWidth: 1,
      }],
    },
    options: {
      animation: defaultAnimation(),
      indexAxis: 'y',
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: { label: ctx => formatHa(ctx.raw) },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Forest Loss (ha)' },
          ticks: { callback: val => formatNumber(val) },
        },
      },
    },
  });
}

/**
 * Chart 5 — Annual Forest Gain (Bar).
 * @param {Array<{year:number, forestGainHa:number}>} data
 * @returns {Chart}
 */
function buildGainChart(data) {
  const canvas = document.getElementById('chart-gain');
  if (!canvas || _canvasOwned(canvas)) return null;

  const labels = data.map(d => d.year);
  const values = data.map(d => d.forestGainHa);

  buildAccessibilityTable(
    canvas,
    ['Year', 'Forest Gain (ha)'],
    data.map(d => [d.year, formatHa(d.forestGainHa)])
  );

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Forest Gain',
        data: values,
        backgroundColor: values.map(() => `${GAIN_BLUE}cc`),
        borderColor: GAIN_BLUE,
        borderWidth: 1,
      }],
    },
    options: {
      animation: defaultAnimation(),
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: { label: ctx => formatHa(ctx.raw) },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Forest Gain (ha)' },
          ticks: { callback: val => formatNumber(val) },
        },
      },
    },
  });
}

/**
 * Chart 6 — Forest Composition (Doughnut).
 * @param {Array<{label:string, pct:number}>} composition
 * @returns {Chart}
 */
function buildCompositionChart(composition) {
  const canvas = document.getElementById('chart-composition');
  if (!canvas || _canvasOwned(canvas)) return null;

  buildAccessibilityTable(
    canvas,
    ['Forest Type', 'Percentage (%)'],
    composition.map(c => [c.label, `${c.pct}%`])
  );

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: composition.map(c => c.label),
      datasets: [{
        data: composition.map(c => c.pct),
        backgroundColor: ['#16a34a', '#22c55e', '#86efac', '#bbf7d0'],
        borderColor: '#ffffff',
        borderWidth: 2,
      }],
    },
    options: {
      animation: defaultAnimation(),
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${ctx.raw}%`,
          },
        },
      },
    },
  });
}

// ============================================================
// Year-range filter helpers
// ============================================================

/**
 * Get filtered yearlyData slice between start and end year (inclusive).
 * @param {Array<{year:number}>} yearlyData
 * @param {number} start
 * @param {number} end
 * @returns {Array}
 */
function filterYearRange(yearlyData, start, end) {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return yearlyData.filter(d => d.year >= lo && d.year <= hi);
}

/**
 * Update charts 1, 2, 5 data with filtered yearlyData slice.
 * @param {Array} filtered
 */
function updateTimeSeriesCharts(filtered) {
  if (!filtered.length) return;

  const labels = filtered.map(d => d.year);

  // Chart 1 — Trend
  if (chartTrend) {
    chartTrend.data.labels                                    = labels;
    chartTrend.data.datasets[0].data                         = filtered.map(d => d.forestCoverHa);
    chartTrend.data.datasets[0].pointBackgroundColor         = filtered.map(() => PRIMARY_GREEN);
    chartTrend.update('none');
  }

  // Chart 2 — Loss
  if (chartLoss) {
    chartLoss.data.labels                              = labels;
    chartLoss.data.datasets[0].data                   = filtered.map(d => d.forestLossHa);
    chartLoss.data.datasets[0].backgroundColor        = filtered.map(() => `${LOSS_RED}cc`);
    chartLoss.update('none');
  }

  // Chart 5 — Gain
  if (chartGain) {
    chartGain.data.labels                              = labels;
    chartGain.data.datasets[0].data                   = filtered.map(d => d.forestGainHa);
    chartGain.data.datasets[0].backgroundColor        = filtered.map(() => `${GAIN_BLUE}cc`);
    chartGain.update('none');
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Highlight the bar/point corresponding to `year` on the time-series charts.
 *
 * analytics.js now owns chart-trend / chart-loss / chart-gain and handles
 * year-snapping itself via EventBus 'year:changed'. To avoid overwriting
 * analytics.js's carefully managed multi-dataset colors, this function is
 * a no-op when any of those canvases are already owned (i.e. analytics.js
 * is running). It only runs for the legacy single-module setup where
 * charts.js built the instances itself.
 * @param {number} year
 */
export function filterChartsToYear(year) {
  // If analytics.js has claimed the canvases, defer entirely to it.
  try {
    const trendCanvas = document.getElementById('chart-trend');
    if (trendCanvas && Chart.getChart(trendCanvas)) return;
  } catch (_) { /* Chart global not yet ready — fall through */ }

  /** @param {Chart} chart  @param {number|null} targetYear */
  const highlightYear = (chart, targetYear, baseColor) => {
    if (!chart || !chart.data.labels) return;
    const colors = chart.data.labels.map(y =>
      y === targetYear ? HIGHLIGHT_COLOR : baseColor
    );
    chart.data.datasets[0].backgroundColor        = colors;
    chart.data.datasets[0].pointBackgroundColor   = colors;
    chart.update('none');
  };

  highlightYear(chartTrend, year, PRIMARY_GREEN);
  highlightYear(chartLoss,  year, `${LOSS_RED}cc`);
  highlightYear(chartGain,  year, `${GAIN_BLUE}cc`);
}

/**
 * Initialise all 6 Chart.js instances.
 * Called once from main.js after data:loaded.
 * @param {object} stats  Parsed statistics.json
 */
export function init(stats) {
  if (!stats) {
    console.warn('[charts.js] init() called with null stats — charts skipped.');
    return;
  }

  _stats = stats;

  const yearlyData  = stats.yearlyData  ?? [];
  const provinces   = stats.provinces   ?? [];
  const districts   = stats.districts   ?? [];
  const composition = stats.composition ?? [];

  // Guard: empty yearlyData
  if (!yearlyData.length) {
    console.warn('[charts.js] yearlyData is empty — time-series charts will be blank.');
  }

  // Build all charts
  chartTrend       = buildTrendChart(yearlyData);
  chartLoss        = buildLossChart(yearlyData);
  chartProvince    = buildProvinceChart(provinces);
  chartDistrict    = buildDistrictChart(districts);
  chartGain        = buildGainChart(yearlyData);
  chartComposition = buildCompositionChart(composition);

  // Populate year-range selects
  if (yearlyData.length) {
    populateYearRangeSelects(yearlyData);
  }

  // Wire year-range filter controls
  const startEl = document.getElementById('year-range-start');
  const endEl   = document.getElementById('year-range-end');

  const applyFilter = () => {
    if (!startEl || !endEl || !yearlyData.length) return;
    const start = parseInt(startEl.value, 10);
    const end   = parseInt(endEl.value,   10);

    // Visual feedback
    const wrappers = document.querySelectorAll('.chart-wrapper');
    wrappers.forEach(w => w.classList.add('updating'));

    setTimeout(() => {
      const filtered = filterYearRange(yearlyData, start, end);
      updateTimeSeriesCharts(filtered.length ? filtered : yearlyData);
      wrappers.forEach(w => w.classList.remove('updating'));
    }, 150);
  };

  if (startEl) startEl.addEventListener('change', applyFilter);
  if (endEl)   endEl.addEventListener('change', applyFilter);

  // Subscribe to year:changed only when charts.js owns the canvases.
  // analytics.js claims chart-trend/loss/gain/composition first (see main.js
  // init order), so filterChartsToYear() would immediately return early.
  // We check at subscription time — if analytics.js already owns chart-trend
  // we skip wiring the listener entirely to avoid a silent no-op on every event.
  try {
    const trendCanvas = document.getElementById('chart-trend');
    if (!trendCanvas || !Chart.getChart(trendCanvas)) {
      EventBus.on('year:changed', ({ year }) => filterChartsToYear(year));
    }
    // If analytics.js owns the canvases it handles year highlight itself
    // via its own _onYearChanged → _applyFilters() subscription.
  } catch (_) {
    // Chart global not yet available — wire anyway as a safety fallback
    EventBus.on('year:changed', ({ year }) => filterChartsToYear(year));
  }
}
