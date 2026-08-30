/**
 * js/analytics.js — Professional Analytics Dashboard
 * Forest Change Analytics for Deforestation Watch Nepal
 *
 * Responsibilities:
 *  - Filter management (year range, province, district)
 *  - KPI card computation and rendering
 *  - Chart.js chart creation and live updates
 *  - Province comparison (metric-switchable horizontal bar)
 *  - District ranking list (top 10, metric-switchable)
 *  - Forest composition donut
 *  - Key findings (auto-derived from data)
 *  - Sortable detailed data table
 *
 * Chart.js 4.4.0 is loaded as CDN global — not imported.
 * Depends on EventBus from eventbus.js.
 */

import { EventBus } from './eventbus.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COLOR = {
  green:        '#16a34a',
  greenLight:   '#22c55e',
  greenPale:    'rgba(22, 163, 74, 0.12)',
  greenArea:    'rgba(22, 163, 74, 0.18)',
  loss:         '#dc2626',
  lossLight:    'rgba(220, 38, 38, 0.75)',
  lossArea:     'rgba(220, 38, 38, 0.12)',
  gain:         '#0369a1',
  gainLight:    'rgba(3, 105, 161, 0.75)',
  gainArea:     'rgba(3, 105, 161, 0.12)',
  neutral:      '#64748b',
  border:       '#e5e7eb',
  text:         '#374151',
  textMuted:    '#6b7280',
  surface:      '#ffffff',
  composition:  ['#15803d', '#166534', '#4ade80', '#86efac'],
};

// District → Province mapping (built from geojson or static fallback)
const DISTRICT_PROVINCE_MAP = {
  Taplejung:'Koshi',Panchthar:'Koshi',Ilam:'Koshi',Jhapa:'Koshi',Morang:'Koshi',
  Sunsari:'Koshi',Dhankuta:'Koshi',Terhathum:'Koshi',Sankhuwasabha:'Koshi',Bhojpur:'Koshi',
  Solukhumbu:'Koshi',Okhaldhunga:'Koshi',Khotang:'Koshi',Udayapur:'Koshi',
  Saptari:'Madhesh',Siraha:'Madhesh',Dhanusha:'Madhesh',Mahottari:'Madhesh',
  Sarlahi:'Madhesh',Rautahat:'Madhesh',Bara:'Madhesh',Parsa:'Madhesh',
  Sindhuli:'Bagmati',Ramechhap:'Bagmati',Dolakha:'Bagmati',Sindhupalchok:'Bagmati',
  Kavrepalanchok:'Bagmati',Lalitpur:'Bagmati',Bhaktapur:'Bagmati',Kathmandu:'Bagmati',
  Nuwakot:'Bagmati',Rasuwa:'Bagmati',Dhading:'Bagmati',Makwanpur:'Bagmati',Chitwan:'Bagmati',
  Gorkha:'Gandaki',Lamjung:'Gandaki',Tanahu:'Gandaki',Syangja:'Gandaki',Kaski:'Gandaki',
  Manang:'Gandaki',Mustang:'Gandaki',Myagdi:'Gandaki',Parbat:'Gandaki',Baglung:'Gandaki',
  Nawalpur:'Gandaki',
  Gulmi:'Lumbini',Palpa:'Lumbini',Nawalparasi:'Lumbini',
  Arghakhanchi:'Lumbini',Kapilvastu:'Lumbini',Rupandehi:'Lumbini',Pyuthan:'Lumbini',
  Rolpa:'Lumbini','Rukum East':'Lumbini',
  'Rukum West':'Karnali',Salyan:'Karnali',Dang:'Lumbini',Banke:'Lumbini',Bardiya:'Lumbini',
  Surkhet:'Karnali',Dailekh:'Karnali',Jajarkot:'Karnali',Dolpa:'Karnali',
  Mugu:'Karnali',Humla:'Karnali',Jumla:'Karnali',Kalikot:'Karnali',
  Achham:'Sudurpashchim',Bajura:'Sudurpashchim',Bajhang:'Sudurpashchim',
  Darchula:'Sudurpashchim',Baitadi:'Sudurpashchim',Dadeldhura:'Sudurpashchim',
  Doti:'Sudurpashchim',Kailali:'Sudurpashchim',Kanchanpur:'Sudurpashchim',
};

// ─────────────────────────────────────────────────────────────
// Module-level state
// ─────────────────────────────────────────────────────────────

/** @type {object|null}  Full statistics.json payload */
let _stats = null;

/** Active filter state */
const _filter = {
  yearStart:  2015,
  yearEnd:    2025,
  province:   'all',
  district:   'all',
};

/** Sort state for the data table */
const _sort = { col: 'year', dir: 'asc' };

/** Chart.js instances */
let _chartTrend       = null;
let _chartLoss        = null;
let _chartGainLoss    = null;
let _chartProvince    = null;
let _chartComposition = null;

/** Currently active province metric */
let _provinceMetric = 'forestLossHa';

/** Currently active district ranking metric */
let _districtMetric = 'forestLossHa';

// ─────────────────────────────────────────────────────────────
// ── CALCULATION FUNCTIONS ──────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Format a number with thousands separator.
 * @param {number} n
 * @returns {string}
 */
function _fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

/**
 * Format a number as hectares string.
 * @param {number} n
 * @returns {string}
 */
function _fmtHa(n) {
  return `${_fmt(n)} ha`;
}

/**
 * Format a signed number with + / − prefix.
 * @param {number} n
 * @returns {string}
 */
function _fmtSigned(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(Math.round(n)).toLocaleString();
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

/**
 * Format a percentage change for display.
 * @param {number} pct
 * @returns {string}
 */
function _fmtPct(pct) {
  if (pct == null || isNaN(pct)) return '';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Get yearly data filtered to [yearStart, yearEnd] for the current filter state.
 * When a district filter is active: synthesises a single-point yearly series
 * from the district's static snapshot (no per-district time series in data).
 * When a province filter is active: uses provinceYearlyData if available,
 * otherwise falls back to the province's static snapshot.
 * When no region filter is active: returns the national yearlyData.
 * @returns {Array<{year,forestCoverHa,forestLossHa,forestGainHa}>}
 */
export function getFilteredYearlyData() {
  if (!_stats?.yearlyData) return [];

  const { province, district, yearStart, yearEnd } = _filter;

  // ── District filter active ──────────────────────────────────
  // No per-district yearly time series exists; synthesise yearly data from
  // the district's static snapshot by scaling the national annual trend.
  if (district !== 'all') {
    const distObj = _stats.districts?.find(d => d.name === district);
    if (distObj) {
      // Compute national cover in 2025 (last point) as baseline for scaling
      const nationalRef = _stats.yearlyData[_stats.yearlyData.length - 1];
      const coverRatio  = (distObj.forestCoverHa ?? 0) / (nationalRef.forestCoverHa || 1);
      const lossRatio   = (distObj.forestLossHa  ?? 0) / (nationalRef.forestLossHa  || 1);
      const gainRatio   = (distObj.forestGainHa  ?? 0) / (nationalRef.forestGainHa  || 1);

      return _stats.yearlyData
        .filter(d => d.year >= yearStart && d.year <= yearEnd)
        .map(d => ({
          year:          d.year,
          forestCoverHa: Math.round(d.forestCoverHa * coverRatio),
          forestLossHa:  Math.round(d.forestLossHa  * lossRatio),
          forestGainHa:  Math.round(d.forestGainHa  * gainRatio),
        }));
    }
  }

  // ── Province filter active ──────────────────────────────────
  if (province !== 'all') {
    // Prefer the per-province yearly series if it exists in the data
    const provYearly = _stats.provinceYearlyData?.[province];
    if (provYearly?.length) {
      return provYearly.filter(d => d.year >= yearStart && d.year <= yearEnd);
    }

    // Fallback: scale national yearly data by province's proportional share
    const provObj    = _stats.provinces?.find(p => p.name === province);
    if (provObj) {
      const nationalRef = _stats.yearlyData[_stats.yearlyData.length - 1];
      const coverRatio  = (provObj.forestCoverHa ?? 0) / (nationalRef.forestCoverHa || 1);
      const lossRatio   = (provObj.forestLossHa  ?? 0) / (nationalRef.forestLossHa  || 1);
      const gainRatio   = (provObj.forestGainHa  ?? 0) / (nationalRef.forestGainHa  || 1);

      return _stats.yearlyData
        .filter(d => d.year >= yearStart && d.year <= yearEnd)
        .map(d => ({
          year:          d.year,
          forestCoverHa: Math.round(d.forestCoverHa * coverRatio),
          forestLossHa:  Math.round(d.forestLossHa  * lossRatio),
          forestGainHa:  Math.round(d.forestGainHa  * gainRatio),
        }));
    }
  }

  // ── National (no region filter) ─────────────────────────────
  return _stats.yearlyData.filter(
    d => d.year >= yearStart && d.year <= yearEnd
  );
}

/**
 * Get districts filtered by the active province filter.
 * Enriches each district with a `netChange` field.
 * @returns {Array}
 */
export function getFilteredDistricts() {
  if (!_stats?.districts) return [];
  let districts = _stats.districts.map(d => ({
    ...d,
    netChange: (d.forestGainHa ?? 0) - (d.forestLossHa ?? 0),
  }));
  if (_filter.province !== 'all') {
    districts = districts.filter(
      d => DISTRICT_PROVINCE_MAP[d.name] === _filter.province
    );
  }
  if (_filter.district !== 'all') {
    districts = districts.filter(d => d.name === _filter.district);
  }
  return districts;
}

/**
 * Get provinces, enriched with netChange.
 * @returns {Array}
 */
export function getProvinces() {
  if (!_stats?.provinces) return [];
  return _stats.provinces.map(p => ({
    ...p,
    netChange: (p.forestGainHa ?? 0) - (p.forestLossHa ?? 0),
  }));
}

/**
 * Calculate cumulative total loss over a yearly dataset.
 * @param {Array} yearlyData
 * @returns {number}
 */
export function calculateTotalLoss(yearlyData) {
  return yearlyData.reduce((sum, d) => sum + (d.forestLossHa ?? 0), 0);
}

/**
 * Calculate cumulative total gain over a yearly dataset.
 * @param {Array} yearlyData
 * @returns {number}
 */
export function calculateTotalGain(yearlyData) {
  return yearlyData.reduce((sum, d) => sum + (d.forestGainHa ?? 0), 0);
}

/**
 * Calculate net change: total gain − total loss.
 * @param {Array} yearlyData
 * @returns {number}
 */
export function calculateNetChange(yearlyData) {
  return calculateTotalGain(yearlyData) - calculateTotalLoss(yearlyData);
}

/**
 * Calculate percentage change between two values.
 * @param {number} from
 * @param {number} to
 * @returns {number}  Percentage, e.g. -2.8 for a 2.8% decrease
 */
export function calculatePercentageChange(from, to) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

/**
 * Return the yearly entry with the highest forestLossHa.
 * @param {Array} yearlyData
 * @returns {{year:number, forestLossHa:number}|null}
 */
export function getHighestLossYear(yearlyData) {
  if (!yearlyData?.length) return null;
  return yearlyData.reduce(
    (max, d) => (d.forestLossHa > max.forestLossHa ? d : max),
    yearlyData[0]
  );
}

/**
 * Return top N districts sorted descending by the given metric key.
 * @param {Array}  districts
 * @param {string} metricKey   e.g. 'forestLossHa'
 * @param {number} [n=10]
 * @returns {Array}
 */
export function getTopDistricts(districts, metricKey, n = 10) {
  return [...districts]
    .sort((a, b) => Math.abs(b[metricKey] ?? 0) - Math.abs(a[metricKey] ?? 0))
    .slice(0, n);
}

/**
 * Return provinces sorted descending by the given metric.
 * @param {Array}  provinces
 * @param {string} metricKey
 * @returns {Array}
 */
export function getProvinceComparison(provinces, metricKey) {
  return [...provinces].sort((a, b) => Math.abs(b[metricKey] ?? 0) - Math.abs(a[metricKey] ?? 0));
}

/**
 * Determine overall trend from yearlyData forest cover.
 * Returns 'Decreasing' | 'Increasing' | 'Stable'.
 * @param {Array} yearlyData
 * @returns {string}
 */
export function getOverallTrend(yearlyData) {
  if (yearlyData.length < 2) return 'Stable';
  const first = yearlyData[0].forestCoverHa;
  const last  = yearlyData[yearlyData.length - 1].forestCoverHa;
  const pct   = calculatePercentageChange(first, last);
  if (pct < -0.5) return 'Decreasing';
  if (pct >  0.5) return 'Increasing';
  return 'Stable';
}

// ─────────────────────────────────────────────────────────────
// ── FILTER POPULATION ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Populate year-range selects from yearlyData years.
 * @param {Array<{year:number}>} yearlyData
 */
function _populateYearSelects(yearlyData) {
  const startEl = document.getElementById('adash-year-start');
  const endEl   = document.getElementById('adash-year-end');
  if (!startEl || !endEl) return;

  const years = [...new Set(yearlyData.map(d => d.year))].sort((a, b) => a - b);

  startEl.innerHTML = '';
  endEl.innerHTML   = '';

  years.forEach(y => {
    const o1 = document.createElement('option');
    o1.value = y; o1.textContent = y;
    startEl.appendChild(o1);

    const o2 = document.createElement('option');
    o2.value = y; o2.textContent = y;
    endEl.appendChild(o2);
  });

  startEl.value = String(years[0]);
  endEl.value   = String(years[years.length - 1]);

  _filter.yearStart = years[0];
  _filter.yearEnd   = years[years.length - 1];
}

/**
 * Populate the district select based on the currently active province filter.
 */
function _populateDistrictSelect() {
  const districtEl = document.getElementById('adash-district');
  if (!districtEl || !_stats?.districts) return;

  // Save current selection if possible
  const prev = districtEl.value;

  districtEl.innerHTML = '<option value="all">All Districts</option>';

  let districts = _stats.districts;
  if (_filter.province !== 'all') {
    districts = districts.filter(
      d => DISTRICT_PROVINCE_MAP[d.name] === _filter.province
    );
  }

  districts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = d.name;
      districtEl.appendChild(opt);
    });

  // Restore previous selection if it still exists
  if ([...districtEl.options].some(o => o.value === prev)) {
    districtEl.value = prev;
  } else {
    districtEl.value = 'all';
    _filter.district = 'all';
  }
}

// ─────────────────────────────────────────────────────────────
// ── KPI CARDS ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Update all four KPI cards from the current filter state.
 */
function _updateKPIs() {
  const yearly = getFilteredYearlyData();
  if (!yearly.length) return;

  // Forest cover: latest year in range
  const latest = yearly[yearly.length - 1];
  const prev   = yearly.length > 1 ? yearly[yearly.length - 2] : null;

  // Total loss & gain over entire range
  const totalLoss = calculateTotalLoss(yearly);
  const totalGain = calculateTotalGain(yearly);
  const netChange = calculateNetChange(yearly);

  _setKpi('kpi-cover', latest.forestCoverHa);
  _setKpi('kpi-loss',  totalLoss);
  _setKpi('kpi-gain',  totalGain);
  _setKpi('kpi-net',   Math.abs(netChange), netChange < 0 ? 'negative' : 'positive');

  // Deltas (compare first vs last year in range for loss/gain)
  const first = yearly[0];
  if (prev) {
    _setDelta('kpi-cover-delta',
      calculatePercentageChange(prev.forestCoverHa, latest.forestCoverHa),
      'vs previous year');
  }
  if (yearly.length >= 2) {
    const lossPct = calculatePercentageChange(first.forestLossHa, latest.forestLossHa);
    const gainPct = calculatePercentageChange(first.forestGainHa, latest.forestGainHa);
    _setDelta('kpi-loss-delta', lossPct, `vs ${first.year}`);
    _setDelta('kpi-gain-delta', gainPct, `vs ${first.year}`);
    _setDelta('kpi-net-delta',  null,     `${_fmtHa(totalGain)} gained · ${_fmtHa(totalLoss)} lost`);
  }
}

/**
 * Set a KPI value element.
 * @param {string} id
 * @param {number} value
 * @param {'negative'|'positive'|undefined} tone
 */
function _setKpi(id, value, tone) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = _fmt(value);
  el.className = 'adash-kpi-card__value';
  if (tone) el.classList.add(`adash-kpi-card__value--${tone}`);
}

/**
 * Set a KPI delta element.
 * @param {string}      id
 * @param {number|null} pct      null → use labelOnly text directly
 * @param {string}      label
 */
function _setDelta(id, pct, label) {
  const el = document.getElementById(id);
  if (!el) return;
  if (pct === null) {
    el.textContent  = label;
    el.className    = 'adash-kpi-card__delta';
    return;
  }
  const arrow = pct >= 0 ? '↑' : '↓';
  const cls   = pct >= 0 ? 'adash-kpi-card__delta--up' : 'adash-kpi-card__delta--down';
  el.innerHTML = `<span class="${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span> ${label}`;
  el.className = 'adash-kpi-card__delta';
}

// ─────────────────────────────────────────────────────────────
// ── CHART DEFAULTS ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Shared Chart.js defaults for all charts.
 */
function _chartDefaults(extraPlugins = {}) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 500, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        titleColor:      '#f9fafb',
        bodyColor:       '#d1d5db',
        borderColor:     'rgba(255,255,255,0.1)',
        borderWidth:     1,
        padding:         10,
        cornerRadius:    6,
        usePointStyle:   true,
      },
      ...extraPlugins,
    },
    scales: {},
  };
}

/**
 * Common y-axis config.
 */
function _yAxis(title) {
  return {
    title: { display: true, text: title, color: COLOR.textMuted, font: { size: 11 } },
    grid:  { color: 'rgba(0,0,0,0.05)', drawBorder: false },
    ticks: {
      color: COLOR.textMuted,
      font:  { size: 11 },
      callback: v => _fmt(v),
    },
    border: { dash: [3, 3], display: false },
  };
}

/**
 * Common x-axis config.
 */
function _xAxis() {
  return {
    grid:  { display: false },
    ticks: { color: COLOR.textMuted, font: { size: 11 } },
    border: { display: false },
  };
}

// ─────────────────────────────────────────────────────────────
// ── CHART 1: FOREST CHANGE OVER TIME (multi-line / area) ──
// ─────────────────────────────────────────────────────────────

/**
 * Build or update the Forest Change Over Time chart.
 * Toggleable datasets via legend, large and visually dominant.
 */
function _buildTrendChart() {
  const canvas = document.getElementById('chart-trend');
  if (!canvas) return;

  const yearly = getFilteredYearlyData();

  const labels   = yearly.map(d => d.year);
  const coverDs  = yearly.map(d => d.forestCoverHa);
  const lossDs   = yearly.map(d => d.forestLossHa);
  const gainDs   = yearly.map(d => d.forestGainHa);

  if (_chartTrend) {
    _chartTrend.data.labels              = labels;
    _chartTrend.data.datasets[0].data   = coverDs;
    _chartTrend.data.datasets[1].data   = lossDs;
    _chartTrend.data.datasets[2].data   = gainDs;
    _chartTrend.update('active');
    _updateTrendSrTable(yearly);
    return;
  }

  _chartTrend = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:            'Forest Cover',
          data:             coverDs,
          borderColor:      COLOR.green,
          backgroundColor:  COLOR.greenArea,
          fill:             false,
          tension:          0.35,
          pointRadius:      4,
          pointHoverRadius: 7,
          borderWidth:      2.5,
          yAxisID:          'yCover',
        },
        {
          label:            'Forest Loss',
          data:             lossDs,
          borderColor:      COLOR.loss,
          backgroundColor:  COLOR.lossArea,
          fill:             true,
          tension:          0.35,
          pointRadius:      3,
          pointHoverRadius: 6,
          borderWidth:      2,
          yAxisID:          'yLossGain',
        },
        {
          label:            'Forest Gain',
          data:             gainDs,
          borderColor:      COLOR.gain,
          backgroundColor:  COLOR.gainArea,
          fill:             true,
          tension:          0.35,
          pointRadius:      3,
          pointHoverRadius: 6,
          borderWidth:      2,
          yAxisID:          'yLossGain',
        },
      ],
    },
    options: {
      ..._chartDefaults(),
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ..._chartDefaults().plugins,
        tooltip: {
          ..._chartDefaults().plugins.tooltip,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${_fmtHa(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: _xAxis(),
        yCover: {
          ..._yAxis('Forest Cover (ha)'),
          position: 'left',
        },
        yLossGain: {
          ..._yAxis('Loss / Gain (ha)'),
          position: 'right',
          grid: { drawOnChartArea: false },
        },
      },
    },
  });

  // Custom interactive legend
  _buildTrendLegend();
  _updateTrendSrTable(yearly);
}

/**
 * Build the custom toggleable legend for the trend chart.
 */
function _buildTrendLegend() {
  const container = document.getElementById('adash-trend-legend');
  if (!container || !_chartTrend) return;

  container.innerHTML = '';

  const datasets = [
    { label: 'Forest Cover', color: COLOR.green },
    { label: 'Forest Loss',  color: COLOR.loss  },
    { label: 'Forest Gain',  color: COLOR.gain  },
  ];

  datasets.forEach((ds, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adash-legend-btn';
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = `
      <span class="adash-legend-dot" style="background:${ds.color}"></span>
      <span>${ds.label}</span>`;

    btn.addEventListener('click', () => {
      const meta = _chartTrend.getDatasetMeta(i);
      meta.hidden = !meta.hidden;
      btn.setAttribute('aria-pressed', String(!meta.hidden));
      btn.classList.toggle('adash-legend-btn--hidden', meta.hidden);
      _chartTrend.update();
    });

    container.appendChild(btn);
  });
}

/**
 * Populate the SR table for the trend chart.
 */
function _updateTrendSrTable(yearly) {
  const tbody = document.getElementById('adash-trend-sr-tbody');
  if (!tbody) return;
  tbody.innerHTML = yearly.map(d =>
    `<tr><td>${d.year}</td><td>${_fmtHa(d.forestCoverHa)}</td><td>${_fmtHa(d.forestLossHa)}</td><td>${_fmtHa(d.forestGainHa)}</td></tr>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────
// ── CHART 2: ANNUAL FOREST LOSS (bar, highlight peak) ──────
// ─────────────────────────────────────────────────────────────

function _buildLossChart() {
  const canvas = document.getElementById('chart-loss');
  if (!canvas) return;

  const yearly = getFilteredYearlyData();
  const labels = yearly.map(d => d.year);
  const values = yearly.map(d => d.forestLossHa);

  const peakEntry = getHighestLossYear(yearly);
  const colors = values.map((_, i) =>
    yearly[i].year === peakEntry?.year ? COLOR.loss : 'rgba(220, 38, 38, 0.55)'
  );

  if (_chartLoss) {
    _chartLoss.data.labels                           = labels;
    _chartLoss.data.datasets[0].data                = values;
    _chartLoss.data.datasets[0].backgroundColor     = colors;
    _chartLoss.data.datasets[0].borderColor         = colors.map(c =>
      c === COLOR.loss ? COLOR.loss : 'rgba(220,38,38,0.8)'
    );
    _chartLoss.update('active');
    _updatePeakStrip(peakEntry);
    _updateLossSrTable(yearly);
    return;
  }

  _chartLoss = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:            'Forest Loss',
        data:             values,
        backgroundColor:  colors,
        borderColor:      colors.map(c => c === COLOR.loss ? COLOR.loss : 'rgba(220,38,38,0.8)'),
        borderWidth:      1,
        borderRadius:     3,
      }],
    },
    options: {
      ..._chartDefaults(),
      plugins: {
        ..._chartDefaults().plugins,
        tooltip: {
          ..._chartDefaults().plugins.tooltip,
          callbacks: {
            label: ctx => `Forest Loss: ${_fmtHa(ctx.raw)}`,
            afterBody: ctx => {
              const yr = ctx[0]?.label;
              if (yr && String(yr) === String(peakEntry?.year)) return ['⚠ Peak loss year'];
              return [];
            },
          },
        },
      },
      scales: {
        x: _xAxis(),
        y: _yAxis('Forest Loss (ha)'),
      },
    },
  });

  _updatePeakStrip(peakEntry);
  _updateLossSrTable(yearly);
}

function _updatePeakStrip(peakEntry) {
  const yearEl = document.getElementById('adash-peak-year');
  const valEl  = document.getElementById('adash-peak-val');
  if (yearEl) yearEl.textContent = peakEntry ? String(peakEntry.year) : '—';
  if (valEl)  valEl.textContent  = peakEntry ? _fmtHa(peakEntry.forestLossHa) : '—';
}

function _updateLossSrTable(yearly) {
  const tbody = document.getElementById('adash-loss-sr-tbody');
  if (!tbody) return;
  tbody.innerHTML = yearly.map(d =>
    `<tr><td>${d.year}</td><td>${_fmtHa(d.forestLossHa)}</td></tr>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────
// ── CHART 3: GAIN vs LOSS (grouped bar) ──────────────────
// ─────────────────────────────────────────────────────────────

function _buildGainLossChart() {
  const canvas = document.getElementById('chart-gain');
  if (!canvas) return;

  const yearly = getFilteredYearlyData();
  const labels = yearly.map(d => d.year);
  const gain   = yearly.map(d => d.forestGainHa);
  const loss   = yearly.map(d => d.forestLossHa);

  const totalGain = calculateTotalGain(yearly);
  const totalLoss = calculateTotalLoss(yearly);
  const net       = totalGain - totalLoss;

  // Update net strip
  const netEl = document.getElementById('adash-net-strip-val');
  if (netEl) {
    netEl.textContent  = _fmtSigned(net) + ' ha';
    netEl.className    = 'adash-insight-strip__value ' +
      (net >= 0 ? 'adash-val--positive' : 'adash-val--negative');
  }

  if (_chartGainLoss) {
    _chartGainLoss.data.labels              = labels;
    _chartGainLoss.data.datasets[0].data   = gain;
    _chartGainLoss.data.datasets[1].data   = loss;
    _chartGainLoss.update('active');
    _updateGainLossSrTable(yearly);
    return;
  }

  _chartGainLoss = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:           'Forest Gain',
          data:            gain,
          backgroundColor: 'rgba(3, 105, 161, 0.72)',
          borderColor:     COLOR.gain,
          borderWidth:     1,
          borderRadius:    3,
        },
        {
          label:           'Forest Loss',
          data:            loss,
          backgroundColor: 'rgba(220, 38, 38, 0.62)',
          borderColor:     COLOR.loss,
          borderWidth:     1,
          borderRadius:    3,
        },
      ],
    },
    options: {
      ..._chartDefaults(),
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ..._chartDefaults().plugins,
        legend: { display: true, position: 'top',
          labels: { color: COLOR.text, font: { size: 11 }, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          ..._chartDefaults().plugins.tooltip,
          callbacks: { label: ctx => `${ctx.dataset.label}: ${_fmtHa(ctx.raw)}` },
        },
      },
      scales: {
        x: _xAxis(),
        y: _yAxis('Hectares (ha)'),
      },
    },
  });

  _updateGainLossSrTable(yearly);
}

function _updateGainLossSrTable(yearly) {
  const tbody = document.getElementById('adash-gainloss-sr-tbody');
  if (!tbody) return;
  tbody.innerHTML = yearly.map(d =>
    `<tr><td>${d.year}</td><td>${_fmtHa(d.forestGainHa)}</td><td>${_fmtHa(d.forestLossHa)}</td></tr>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────
// ── CHART 4: PROVINCE COMPARISON (horizontal bar) ─────────
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// ── RADIAL PROVINCE CHART (SVG) ───────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Environmental intelligence color palette — greens / teals.
 * One color per province, outermost ring first.
 */
const RADIAL_COLORS = [
  '#0d9488', // teal-600       — Koshi       (outermost)
  '#0f766e', // teal-700       — Madhesh
  '#059669', // emerald-600    — Bagmati
  '#16a34a', // green-600      — Gandaki
  '#15803d', // green-700      — Lumbini
  '#166534', // green-800      — Karnali
  '#134e4a', // teal-900       — Sudurpashchim (innermost)
];

/** Radial chart state — stored so metric switches can re-render in-place. */
let _radialState = null;

/**
 * Build or update the province radial progress chart for the active metric.
 * Pure SVG implementation — no Chart.js dependency.
 * @param {string} [metricKey]
 */
function _buildProvinceChart(metricKey) {
  if (metricKey) _provinceMetric = metricKey;

  const wrap = document.getElementById('province-radial-wrap');
  if (!wrap) return;

  const provinces = getProvinces();

  // Sort descending by absolute value of the active metric so the
  // largest value always gets the outermost ring.
  const sorted = getProvinceComparison(provinces, _provinceMetric);

  const metricLabel = {
    forestCoverHa: 'Forest Cover',
    forestLossHa:  'Forest Loss',
    forestGainHa:  'Forest Gain',
    netChange:     'Net Change',
  }[_provinceMetric] ?? 'Value';

  const metricUnit = 'ha';

  // Raw values (signed for netChange, absolute for others)
  const rawValues = sorted.map(p => {
    const v = p[_provinceMetric] ?? 0;
    return _provinceMetric === 'netChange' ? v : Math.abs(v);
  });

  // Max absolute value → maps to 100% arc fill
  const maxVal = Math.max(...rawValues.map(Math.abs), 1);

  // Progress fraction [0,1] for each province
  const fractions = rawValues.map(v => Math.abs(v) / maxVal);

  // ── Derived dimensions ──────────────────────────────────────
  const N          = sorted.length;           // 7 provinces
  const GAP_DEG    = 90;                      // opening gap at bottom (degrees)
  const ARC_DEG    = 360 - GAP_DEG;          // active arc span = 270°
  const START_DEG  = 135;                     // arc starts at bottom-left

  // Responsive sizing: read container width, fall back to 340
  const containerW = wrap.offsetWidth || 340;
  const LABEL_W    = Math.min(Math.max(containerW * 0.30, 90), 120); // label column
  const chartW     = containerW - LABEL_W;
  const SVG_SIZE   = Math.min(chartW, 320);

  const cx = SVG_SIZE / 2;
  const cy = SVG_SIZE / 2;

  // Ring geometry: outermost ring first
  const TRACK_W    = Math.max(SVG_SIZE * 0.048, 10);  // stroke width
  const RING_GAP   = Math.max(SVG_SIZE * 0.022, 5);   // gap between rings
  const OUTER_R    = (SVG_SIZE / 2) - TRACK_W / 2 - 4;

  // ── Helper: polar → cartesian ───────────────────────────────
  function polarToCart(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  // ── Helper: SVG arc path for a progress ring ────────────────
  function arcPath(cx, cy, r, startDeg, endDeg) {
    const s   = polarToCart(cx, cy, r, startDeg);
    const e   = polarToCart(cx, cy, r, endDeg);
    const lg  = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${lg} 1 ${e.x} ${e.y}`;
  }

  // ── Helper: format value for tooltip / label ────────────────
  // (used in tooltip; defined here for closure over metricUnit)
  // ── Build SVG markup ────────────────────────────────────────
  const svgTotalH = SVG_SIZE;

  // For each province ring (i=0 = outermost = sorted[0] = highest value)
  let rings = '';
  let animDefs = '';

  sorted.forEach((prov, i) => {
    const r         = OUTER_R - i * (TRACK_W + RING_GAP);
    if (r < TRACK_W) return; // skip if rings run out of space

    const fraction  = fractions[i];
    const color     = RADIAL_COLORS[i % RADIAL_COLORS.length];
    const endDeg    = START_DEG + ARC_DEG * fraction;
    const trackEnd  = START_DEG + ARC_DEG;

    // Track (background arc)
    const trackPath = arcPath(cx, cy, r, START_DEG, trackEnd);
    // Progress arc
    const progPath  = arcPath(cx, cy, r, START_DEG, endDeg);

    // Arc length for stroke-dasharray animation
    const arcLen    = r * 2 * Math.PI * (ARC_DEG / 360);
    const dashFill  = arcLen * fraction;
    const pathId    = `radial-path-${i}`;

    // Value label: positioned just past the end of the progress arc
    const labelPt   = polarToCart(cx, cy, r, endDeg);

    // Signed value label text
    const dispVal = _provinceMetric === 'netChange'
      ? (rawValues[i] >= 0 ? `+${_fmt(rawValues[i])}` : `−${_fmt(Math.abs(rawValues[i]))}`) + ' ha'
      : `${_fmt(rawValues[i])} ha`;

    // Risk level via data attribute for tooltip
    const riskAttr = prov.riskLevel ? ` data-risk="${prov.riskLevel}"` : '';

    // Province's share of the 7-province total (computed after rawValues is fully built)
    // We'll patch the aria-label after the loop; for now use a placeholder.
    const pctOfMax = (fraction * 100).toFixed(0);

    rings += `
      <g class="radial-ring" data-idx="${i}" data-name="${prov.name}"
         data-value="${rawValues[i]}" data-pct="${pctOfMax}"
         data-metric="${metricLabel}" data-unit="${metricUnit}"${riskAttr}
         tabindex="0" role="img" aria-label="${prov.name}: ${dispVal}">
        <!-- Background track -->
        <path class="radial-track"
              d="${trackPath}"
              stroke-width="${TRACK_W}"
              fill="none" />
        <!-- Progress arc -->
        <path class="radial-progress"
              id="${pathId}"
              d="${progPath}"
              stroke="${color}"
              stroke-width="${TRACK_W}"
              stroke-linecap="round"
              fill="none"
              style="--arc-fill:${dashFill};--arc-total:${arcLen};"
              stroke-dasharray="${arcLen}"
              stroke-dashoffset="${arcLen}" />
        <!-- Value badge near arc end -->
        <text class="radial-val-label"
              x="${labelPt.x + (labelPt.x > cx ? 5 : -5)}"
              y="${labelPt.y + (labelPt.y > cy ? 8 : -4)}"
              text-anchor="${labelPt.x > cx ? 'start' : 'end'}"
              fill="${color}">${dispVal}</text>
      </g>`;

    // CSS keyframe per ring with staggered delay
    animDefs += `
      #${pathId} { animation: radialFill ${0.9 + i * 0.12}s cubic-bezier(0.4,0,0.2,1) ${i * 0.08}s both; }`;
  });

  // ── Province name labels (left side legend) ─────────────────
  // Evenly space labels vertically inside the SVG height
  let legendItems = '';
  const legendH = svgTotalH;
  sorted.forEach((prov, i) => {
    const color   = RADIAL_COLORS[i % RADIAL_COLORS.length];
    const yPos    = ((i + 0.5) / N) * legendH;
    legendItems += `
      <div class="radial-legend-item" data-ring="${i}"
           style="top:${yPos.toFixed(1)}px; --ring-color:${color};">
        <span class="radial-legend-dot" style="background:${color};"></span>
        <span class="radial-legend-name">${prov.name}</span>
      </div>`;
  });

  // ── Center label ─────────────────────────────────────────────
  const centerLabel = metricLabel;
  const centerSub   = `${N} Provinces`;

  // ── Assemble final HTML ──────────────────────────────────────
  wrap.innerHTML = `
    <style>
      @keyframes radialFill {
        from { stroke-dashoffset: var(--arc-total); }
        to   { stroke-dashoffset: calc(var(--arc-total) - var(--arc-fill)); }
      }
      ${animDefs}
    </style>
    <div class="radial-chart-inner">
      <div class="radial-legend" style="height:${svgTotalH}px;" aria-hidden="true">
        ${legendItems}
      </div>
      <div class="radial-svg-area">
        <svg viewBox="0 0 ${SVG_SIZE} ${svgTotalH}"
             width="${SVG_SIZE}" height="${svgTotalH}"
             role="presentation" aria-hidden="true"
             class="radial-svg">
          ${rings}
        </svg>
        <div class="radial-center-label" aria-hidden="true">
          <span class="radial-center-metric">${centerLabel}</span>
          <span class="radial-center-sub">${centerSub}</span>
        </div>
      </div>
    </div>
    <div class="radial-tooltip" id="province-radial-tooltip" role="tooltip" aria-live="polite"></div>`;

  // ── National total for real percentage share in tooltip ──────
  const nationalTotal = rawValues.reduce((s, v) => s + Math.abs(v), 0);

  // ── Wire hover / focus interactions ──────────────────────────
  _wireRadialInteractions(wrap, sorted, rawValues, fractions, metricLabel, nationalTotal);

  // ── Accessibility table ──────────────────────────────────────
  _updateProvinceSrTable(sorted);

  // ── Store state for resize re-renders ────────────────────────
  _radialState = { metricKey: _provinceMetric };
}

/**
 * Wire hover/focus interactions for radial rings.
 * @private
 */
function _wireRadialInteractions(wrap, sorted, rawValues, fractions, metricLabel, nationalTotal) {
  const tooltip = wrap.querySelector('#province-radial-tooltip');
  if (!tooltip) return;

  wrap.querySelectorAll('.radial-ring').forEach((ring, i) => {
    const showTip = () => {
      const prov    = sorted[i];
      const val     = rawValues[i];
      // Real share of the national total across all 7 provinces
      const sharePct = nationalTotal > 0
        ? ((Math.abs(val) / nationalTotal) * 100).toFixed(1)
        : '—';
      const risk    = ring.dataset.risk ? `<div class="radial-tip-row"><span>Risk</span><span class="radial-tip-risk">${ring.dataset.risk}</span></div>` : '';
      const dispVal = _provinceMetric === 'netChange'
        ? (val >= 0 ? `+${_fmt(val)}` : `−${_fmt(Math.abs(val))}`) + ' ha'
        : `${_fmt(val)} ha`;

      tooltip.innerHTML = `
        <div class="radial-tip-name">${prov.name}</div>
        <div class="radial-tip-row"><span>${metricLabel}</span><span>${dispVal}</span></div>
        <div class="radial-tip-row"><span>Share of total</span><span>${sharePct}%</span></div>
        ${risk}`;
      tooltip.classList.add('radial-tooltip--visible');

      // Highlight the hovered ring, dim others
      wrap.querySelectorAll('.radial-progress').forEach((p, j) => {
        p.style.opacity = (j === i) ? '1' : '0.35';
      });
      wrap.querySelectorAll('.radial-legend-item').forEach((l, j) => {
        l.classList.toggle('radial-legend-item--active', j === i);
      });
    };

    const hideTip = () => {
      tooltip.classList.remove('radial-tooltip--visible');
      wrap.querySelectorAll('.radial-progress').forEach(p => { p.style.opacity = ''; });
      wrap.querySelectorAll('.radial-legend-item').forEach(l => l.classList.remove('radial-legend-item--active'));
    };

    ring.addEventListener('mouseenter', showTip);
    ring.addEventListener('focusin',    showTip);
    ring.addEventListener('mouseleave', hideTip);
    ring.addEventListener('focusout',   hideTip);
  });

  // Position tooltip near mouse
  wrap.addEventListener('mousemove', e => {
    const rect = wrap.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;
    const tipW = tooltip.offsetWidth  || 170;
    const tipH = tooltip.offsetHeight || 90;
    tooltip.style.left = `${Math.min(x + 14, rect.width  - tipW - 8)}px`;
    tooltip.style.top  = `${Math.max(y - tipH - 10, 8)}px`;
  });
}

function _updateProvinceSrTable(sorted) {
  const tbody = document.getElementById('adash-province-sr-tbody');
  if (!tbody) return;
  tbody.innerHTML = sorted.map(p =>
    `<tr><td>${p.name}</td><td>${_fmtHa(p.forestCoverHa)}</td><td>${_fmtHa(p.forestLossHa)}</td><td>${_fmtHa(p.forestGainHa)}</td></tr>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────
// ── DISTRICT RANKING LIST ────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Render the top 10 districts ranking list.
 * @param {string} [metricKey]
 */
function _renderDistrictRanking(metricKey) {
  if (metricKey) _districtMetric = metricKey;

  const container = document.getElementById('adash-ranking-list');
  if (!container) return;

  const allDistricts = getFilteredDistricts();
  const top10 = getTopDistricts(allDistricts, _districtMetric, 10);

  if (!top10.length) {
    container.innerHTML = '<p class="adash-empty">No district data available for the selected filters.</p>';
    return;
  }

  const maxVal = Math.abs(top10[0][_districtMetric] ?? 0);

  const metricLabel = {
    forestLossHa: 'loss',
    forestGainHa: 'gain',
    netChange:    'net change',
  }[_districtMetric] ?? 'ha';

  // Update subtitle
  const subtitle = document.getElementById('adash-district-subtitle');
  if (subtitle) subtitle.textContent = `Ranked by forest ${metricLabel} (ha)`;

  container.innerHTML = '';
  top10.forEach((d, idx) => {
    const raw   = d[_districtMetric] ?? 0;
    const val   = Math.abs(raw);
    const pct   = maxVal > 0 ? (val / maxVal) * 100 : 0;

    const isLoss    = _districtMetric === 'forestLossHa' || (_districtMetric === 'netChange' && raw < 0);
    const barColor  = isLoss ? COLOR.loss : COLOR.gain;

    const row = document.createElement('div');
    row.className = 'adash-rank-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <span class="adash-rank-num">${idx + 1}</span>
      <span class="adash-rank-name">${d.name}</span>
      <div class="adash-rank-bar-wrap" aria-hidden="true">
        <div class="adash-rank-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <span class="adash-rank-val" style="color:${barColor}">${_fmtHa(val)}</span>`;

    container.appendChild(row);
  });

  // SR table
  const tbody = document.getElementById('adash-district-sr-tbody');
  if (tbody) {
    tbody.innerHTML = top10.map((d, i) =>
      `<tr><td>${i+1}</td><td>${d.name}</td><td>${_fmtHa(d[_districtMetric])}</td></tr>`
    ).join('');
  }
}

// ─────────────────────────────────────────────────────────────
// ── CHART 5: FOREST COMPOSITION (donut) ──────────────────
// ─────────────────────────────────────────────────────────────

function _buildCompositionChart() {
  const canvas = document.getElementById('chart-composition');
  if (!canvas) return;

  // ── Resolve composition data based on active filter ──────────
  // Priority: district > province > national
  // Falls back to national if the selected entity has no composition data.
  let composition = null;
  let scopeLabel  = 'Nepal (National)';

  if (_filter.district !== 'all') {
    const distObj = _stats?.districts?.find(d => d.name === _filter.district);
    if (distObj?.composition) {
      composition = distObj.composition;
      scopeLabel  = _filter.district + ' District';
    }
  }

  if (!composition && _filter.province !== 'all') {
    const provObj = _stats?.provinces?.find(p => p.name === _filter.province);
    if (provObj?.composition) {
      composition = provObj.composition;
      scopeLabel  = _filter.province + ' Province';
    }
  }

  if (!composition) {
    composition = _stats?.composition;
    scopeLabel  = 'Nepal (National)';
  }

  if (!composition) return;

  // ── Total cover for centre value and tooltip ha ───────────────
  const yearly     = getFilteredYearlyData();
  const totalCover = yearly.length
    ? yearly[yearly.length - 1].forestCoverHa
    : (_stats.forestCoverHa ?? 0);

  // ── Update donut centre ───────────────────────────────────────
  const centerEl = document.getElementById('adash-donut-total');
  if (centerEl) centerEl.textContent = _fmt(totalCover);

  // ── Update scope subtitle ─────────────────────────────────────
  const scopeEl = document.getElementById('adash-composition-scope');
  if (scopeEl) scopeEl.textContent = scopeLabel;

  // ── Build composition legend ──────────────────────────────────
  _buildCompositionLegend(composition);

  // ── SR table ─────────────────────────────────────────────────
  const tbody = document.getElementById('adash-composition-sr-tbody');
  if (tbody) {
    tbody.innerHTML = composition.map(c =>
      `<tr><td>${c.label}</td><td>${c.pct}%</td><td>${_fmtHa(Math.round(totalCover * c.pct / 100))}</td></tr>`
    ).join('');
  }

  if (_chartComposition) {
    // Update both data and tooltip when filter changes
    _chartComposition.data.labels                  = composition.map(c => c.label);
    _chartComposition.data.datasets[0].data        = composition.map(c => c.pct);
    _chartComposition.options.plugins.tooltip.callbacks.label = ctx => {
      const ha = totalCover > 0 ? Math.round(totalCover * ctx.raw / 100) : 0;
      return `${ctx.label}: ${ctx.raw}% (${_fmt(ha)} ha)`;
    };
    _chartComposition.update('active');
    return;
  }

  _chartComposition = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: composition.map(c => c.label),
      datasets: [{
        data:            composition.map(c => c.pct),
        backgroundColor: COLOR.composition,
        borderColor:     '#ffffff',
        borderWidth:     3,
        hoverOffset:     6,
      }],
    },
    options: {
      ..._chartDefaults(),
      cutout: '68%',
      plugins: {
        ..._chartDefaults().plugins,
        tooltip: {
          ..._chartDefaults().plugins.tooltip,
          callbacks: {
            label: ctx => {
              const ha = totalCover > 0 ? Math.round(totalCover * ctx.raw / 100) : 0;
              return `${ctx.label}: ${ctx.raw}% (${_fmt(ha)} ha)`;
            },
          },
        },
      },
    },
  });
}

function _buildCompositionLegend(composition) {
  const container = document.getElementById('adash-composition-legend');
  if (!container) return;
  container.innerHTML = '';
  composition.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'adash-comp-legend-item';
    item.innerHTML = `
      <span class="adash-comp-legend-dot" style="background:${COLOR.composition[i]}"></span>
      <span class="adash-comp-legend-label">${c.label}</span>
      <span class="adash-comp-legend-pct">${c.pct}%</span>`;
    container.appendChild(item);
  });
}

// ─────────────────────────────────────────────────────────────
// ── KEY FINDINGS ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Auto-derive key findings from current filter state.
 */
function _renderFindings() {
  const container = document.getElementById('adash-findings-grid');
  if (!container) return;

  const yearly    = getFilteredYearlyData();
  const districts = getFilteredDistricts();
  const provinces = getProvinces();

  if (!yearly.length) {
    container.innerHTML = '<p class="adash-empty">No data available for the selected filters.</p>';
    return;
  }

  const peakLoss      = getHighestLossYear(yearly);
  const trend         = getOverallTrend(yearly);
  const topLossDist   = getTopDistricts(districts, 'forestLossHa', 1)[0];
  const topGainDist   = getTopDistricts(districts, 'forestGainHa', 1)[0];
  const topLossProv   = getProvinceComparison(provinces, 'forestLossHa')[0];
  const netTotal      = calculateNetChange(yearly);
  const trendPct      = yearly.length >= 2
    ? calculatePercentageChange(yearly[0].forestCoverHa, yearly[yearly.length - 1].forestCoverHa)
    : 0;

  const trendIcon  = trend === 'Decreasing' ? '📉' : trend === 'Increasing' ? '📈' : '➡';
  const trendColor = trend === 'Decreasing' ? 'loss' : trend === 'Increasing' ? 'gain' : 'neutral';

  const findings = [
    {
      icon:    'fa-arrow-trend-down',
      iconCls: 'findings-icon--loss',
      title:   'Peak Loss Year',
      value:   peakLoss ? String(peakLoss.year) : '—',
      detail:  peakLoss ? `${_fmtHa(peakLoss.forestLossHa)} lost` : '',
    },
    {
      icon:    'fa-location-dot',
      iconCls: 'findings-icon--loss',
      title:   'Highest Loss District',
      value:   topLossDist?.name ?? (districts.length ? 'See data' : 'N/A'),
      detail:  topLossDist ? _fmtHa(topLossDist.forestLossHa) : '',
    },
    {
      icon:    'fa-seedling',
      iconCls: 'findings-icon--gain',
      title:   'Highest Gain District',
      value:   topGainDist?.name ?? (districts.length ? 'See data' : 'N/A'),
      detail:  topGainDist ? _fmtHa(topGainDist.forestGainHa) : '',
    },
    {
      icon:    'fa-map',
      iconCls: 'findings-icon--province',
      title:   'Highest Loss Province',
      value:   topLossProv?.name ?? '—',
      detail:  topLossProv ? _fmtHa(topLossProv.forestLossHa) : '',
    },
    {
      icon:    'fa-scale-balanced',
      iconCls: netTotal >= 0 ? 'findings-icon--gain' : 'findings-icon--loss',
      title:   'Net Forest Change',
      value:   _fmtSigned(netTotal) + ' ha',
      detail:  `Over ${_filter.yearStart}–${_filter.yearEnd}`,
    },
    {
      icon:    trend === 'Decreasing' ? 'fa-chart-line' : 'fa-chart-line',
      iconCls: `findings-icon--${trendColor}`,
      title:   'Overall Trend',
      value:   `${trendIcon} ${trend}`,
      detail:  `${_fmtPct(trendPct)} cover change`,
    },
  ];

  container.innerHTML = '';
  findings.forEach(f => {
    const card = document.createElement('div');
    card.className = 'adash-finding-card';
    card.innerHTML = `
      <div class="adash-finding-card__icon ${f.iconCls}">
        <i class="fa-solid ${f.icon}" aria-hidden="true"></i>
      </div>
      <div class="adash-finding-card__body">
        <span class="adash-finding-card__title">${f.title}</span>
        <span class="adash-finding-card__value">${f.value}</span>
        ${f.detail ? `<span class="adash-finding-card__detail">${f.detail}</span>` : ''}
      </div>`;
    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────
// ── DETAILED DATA TABLE ──────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Render or re-render the detailed data table.
 */
function _renderTable() {
  const tbody = document.getElementById('adash-table-tbody');
  if (!tbody) return;

  const yearly = getFilteredYearlyData();

  // Enrich with net change and change %
  const rows = yearly.map((d, i) => ({
    year:           d.year,
    forestCoverHa:  d.forestCoverHa,
    forestLossHa:   d.forestLossHa,
    forestGainHa:   d.forestGainHa,
    netChange:      d.forestGainHa - d.forestLossHa,
    changePct:      i === 0 ? null
      : calculatePercentageChange(yearly[i-1].forestCoverHa, d.forestCoverHa),
  }));

  // Sort
  const { col, dir } = _sort;
  rows.sort((a, b) => {
    const av = a[col] ?? 0;
    const bv = b[col] ?? 0;
    return dir === 'asc' ? av - bv : bv - av;
  });

  tbody.innerHTML = rows.map(r => {
    const netCls = r.netChange >= 0 ? 'adash-val--positive' : 'adash-val--negative';
    const pctCls = r.changePct == null ? '' :
      r.changePct >= 0 ? 'adash-val--positive' : 'adash-val--negative';
    return `<tr>
      <td class="adash-td adash-td--year">${r.year}</td>
      <td class="adash-td">${_fmtHa(r.forestCoverHa)}</td>
      <td class="adash-td adash-td--loss">${_fmtHa(r.forestLossHa)}</td>
      <td class="adash-td adash-td--gain">${_fmtHa(r.forestGainHa)}</td>
      <td class="adash-td ${netCls}">${_fmtSigned(r.netChange)} ha</td>
      <td class="adash-td ${pctCls}">${r.changePct != null ? _fmtPct(r.changePct) : '—'}</td>
    </tr>`;
  }).join('');
}

/**
 * Wire sortable column headers.
 */
function _wireTableSort() {
  const table = document.getElementById('adash-data-table');
  if (!table) return;

  table.querySelectorAll('.adash-th--sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_sort.col === col) {
        _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        _sort.col = col;
        _sort.dir = 'asc';
      }
      // Update aria-sort
      table.querySelectorAll('.adash-th--sortable').forEach(t => {
        t.setAttribute('aria-sort', 'none');
        const icon = t.querySelector('.adash-sort-icon');
        if (icon) icon.textContent = '';
      });
      th.setAttribute('aria-sort', _sort.dir === 'asc' ? 'ascending' : 'descending');
      const icon = th.querySelector('.adash-sort-icon');
      if (icon) icon.textContent = _sort.dir === 'asc' ? ' ↑' : ' ↓';

      _renderTable();
    });
  });

  // Set initial sort indicator on Year column
  const yearTh = table.querySelector('[data-col="year"]');
  if (yearTh) {
    yearTh.setAttribute('aria-sort', 'ascending');
    const icon = yearTh.querySelector('.adash-sort-icon');
    if (icon) icon.textContent = ' ↑';
  }
}

/**
 * Wire the table collapse/expand toggle.
 */
function _wireTableToggle() {
  const btn  = document.getElementById('adash-table-toggle');
  const wrap = document.getElementById('adash-table-wrap');
  if (!btn || !wrap) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    wrap.classList.toggle('adash-table-wrap--collapsed', expanded);
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
    }
  });
}

// ─────────────────────────────────────────────────────────────
// ── FILTER WIRING ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Apply all filters and refresh every dashboard widget.
 */
function _applyFilters() {
  // Read current filter state
  const startEl    = document.getElementById('adash-year-start');
  const endEl      = document.getElementById('adash-year-end');
  const provinceEl = document.getElementById('adash-province');
  const districtEl = document.getElementById('adash-district');

  if (startEl) _filter.yearStart = parseInt(startEl.value, 10);
  if (endEl)   _filter.yearEnd   = parseInt(endEl.value,   10);

  // Enforce start ≤ end
  if (_filter.yearStart > _filter.yearEnd) {
    [_filter.yearStart, _filter.yearEnd] = [_filter.yearEnd, _filter.yearStart];
    if (startEl) startEl.value = String(_filter.yearStart);
    if (endEl)   endEl.value   = String(_filter.yearEnd);
  }

  if (provinceEl) _filter.province = provinceEl.value;
  if (districtEl) _filter.district = districtEl.value;

  _refreshAll();
}

/**
 * Reset all filters to defaults and refresh.
 */
function _resetFilters() {
  const years     = _stats.yearlyData.map(d => d.year).sort((a, b) => a - b);
  const startEl   = document.getElementById('adash-year-start');
  const endEl     = document.getElementById('adash-year-end');
  const provEl    = document.getElementById('adash-province');
  const distEl    = document.getElementById('adash-district');

  if (startEl) startEl.value = String(years[0]);
  if (endEl)   endEl.value   = String(years[years.length - 1]);
  if (provEl)  provEl.value  = 'all';
  if (distEl)  distEl.value  = 'all';

  _filter.yearStart = years[0];
  _filter.yearEnd   = years[years.length - 1];
  _filter.province  = 'all';
  _filter.district  = 'all';

  _populateDistrictSelect();
  _refreshAll();
}

/**
 * Refresh every dashboard widget with the current filter state.
 */
function _refreshAll() {
  _updateKPIs();
  _buildTrendChart();
  _buildLossChart();
  _buildGainLossChart();
  _buildProvinceChart(_provinceMetric);
  _renderDistrictRanking(_districtMetric);
  _buildCompositionChart();
  _renderFindings();
  _renderTable();
}

// ─────────────────────────────────────────────────────────────
// ── METRIC SWITCHER BUTTONS ──────────────────────────────
// ─────────────────────────────────────────────────────────────

function _wireMetricButtons() {
  // Province metric buttons
  document.querySelectorAll('.adash-metric-btn[data-metric]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.adash-metric-btn[data-metric]').forEach(b => {
        b.classList.remove('adash-metric-btn--active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('adash-metric-btn--active');
      btn.setAttribute('aria-pressed', 'true');
      _buildProvinceChart(btn.dataset.metric);
    });
  });

  // District ranking buttons
  document.querySelectorAll('.adash-district-btn[data-dmetric]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.adash-district-btn[data-dmetric]').forEach(b => {
        b.classList.remove('adash-metric-btn--active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('adash-metric-btn--active');
      btn.setAttribute('aria-pressed', 'true');
      _renderDistrictRanking(btn.dataset.dmetric);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// ── EVENT BUS INTEGRATION ────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Handle year:changed from the Time Explorer in dashboard.js.
 * Snap the year-end select to the chosen year and refresh.
 * @param {{ year: number }} payload
 */
function _onYearChanged({ year }) {
  const startEl = document.getElementById('adash-year-start');
  const endEl   = document.getElementById('adash-year-end');
  if (!endEl) return;

  // Snap year-end to the selected year if it's within the available range
  if ([...endEl.options].some(o => Number(o.value) === year)) {
    endEl.value = String(year);
    _filter.yearEnd = year;

    // If the new end is before the current start, snap start back too
    if (_filter.yearStart > year && startEl) {
      startEl.value = String(year);
      _filter.yearStart = year;
    }

    _applyFilters();
  }
}

// ─────────────────────────────────────────────────────────────
// ── PUBLIC INIT ──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

/**
 * Initialise the Analytics Dashboard.
 * Called from main.js after data:loaded.
 * @param {object} stats  Parsed statistics.json
 */
export function init(stats) {
  if (!stats) {
    console.warn('[analytics.js] init() called with null stats — dashboard skipped.');
    return;
  }

  _stats = stats;

  // 1. Populate filter selects
  _populateYearSelects(stats.yearlyData ?? []);
  _populateDistrictSelect();

  // 2. Wire filter events
  const startEl    = document.getElementById('adash-year-start');
  const endEl      = document.getElementById('adash-year-end');
  const provinceEl = document.getElementById('adash-province');
  const districtEl = document.getElementById('adash-district');
  const resetBtn   = document.getElementById('adash-reset');

  if (startEl)    startEl.addEventListener('change', _applyFilters);
  if (endEl)      endEl.addEventListener('change', _applyFilters);
  if (provinceEl) {
    provinceEl.addEventListener('change', () => {
      _filter.province = provinceEl.value;
      _filter.district = 'all';
      _populateDistrictSelect();
      _applyFilters();
    });
  }
  if (districtEl) districtEl.addEventListener('change', _applyFilters);
  if (resetBtn)   resetBtn.addEventListener('click', _resetFilters);

  // 3. Wire metric switch buttons
  _wireMetricButtons();

  // 4. Wire table sort and toggle
  _wireTableSort();
  _wireTableToggle();

  // 5. Subscribe to Time Explorer year:changed
  EventBus.on('year:changed', _onYearChanged);

  // 6. Initial full render
  _refreshAll();

  // 7. Re-render radial chart on container resize (responsive)
  const radialWrap = document.getElementById('province-radial-wrap');
  if (radialWrap && typeof ResizeObserver !== 'undefined') {
    let _resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => _buildProvinceChart(), 120);
    });
    ro.observe(radialWrap);
  }
}
