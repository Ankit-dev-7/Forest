/**
 * js/prediction.js — Prediction Dashboard module
 * Renders prediction cards, top-10 risk list, and prediction charts.
 * Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7, 9.8
 *
 * NOTE: Chart (Chart.js) is a CDN global — not imported.
 */

import { EventBus } from './eventbus.js';
import { getRiskColor, getRiskLevel, formatHa, formatNumber } from './utils.js';

// ============================================================
// Module-level state
// ============================================================

/** @type {Chart|null} Historical vs Predicted chart */
let chartHistorical = null;

// ============================================================
// DOM helpers
// ============================================================

/**
 * Derive the badge CSS class from a risk score.
 * @param {number} score
 * @returns {string}
 */
function riskBadgeClass(score) {
  if (score >= 80) return 'badge-red';
  if (score >= 60) return 'badge-orange';
  if (score >= 40) return 'badge-amber';
  return 'badge-green';
}

/**
 * Render a single prediction card element.
 * Exposed as a named export for testability.
 * @param {{ name:string, riskScore:number, riskLevel:string, confidencePct:number }} district
 * @returns {HTMLElement}
 */
export function renderPredictionCard(district) {
  const { name, riskScore, riskLevel, confidencePct } = district;
  const isCritical = riskScore >= 80;

  const card = document.createElement('article');
  card.className = `prediction-card card${isCritical ? ' card-critical' : ''}`;
  card.setAttribute('aria-label', `Prediction card for ${name}`);

  const color = getRiskColor(riskScore);

  // Score
  const scoreEl = document.createElement('div');
  scoreEl.className = 'prediction-card__score';
  scoreEl.style.color = color;
  scoreEl.textContent = riskScore;

  // Name
  const nameEl = document.createElement('h3');
  nameEl.style.cssText = 'font-size:1rem;font-weight:600;margin-bottom:0.5rem;';
  nameEl.textContent = name;

  // Warning icon for critical
  if (isCritical) {
    const iconEl = document.createElement('span');
    iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true" style="color:var(--color-danger);margin-right:0.4rem;"></i>';
    nameEl.prepend(iconEl);
  }

  // Badge
  const badge = document.createElement('span');
  badge.className = `badge ${riskBadgeClass(riskScore)}`;
  badge.textContent = riskLevel ?? getRiskLevel(riskScore);

  // Confidence
  const conf = document.createElement('p');
  conf.style.cssText = 'font-size:0.75rem;color:var(--color-neutral-500);margin-top:0.5rem;';
  conf.textContent = `Confidence: ${confidencePct}%`;

  card.appendChild(scoreEl);
  card.appendChild(nameEl);
  card.appendChild(badge);
  card.appendChild(conf);

  return card;
}

// ============================================================
// Section renderers
// ============================================================

/**
 * Render top-5 prediction cards into #prediction-cards-container.
 * @param {Array} districts  Sorted descending by riskScore
 */
function renderPredictionCards(districts) {
  const container = document.getElementById('prediction-cards-container');
  if (!container) return;

  container.innerHTML = '';
  const top5 = districts.slice(0, 5);
  top5.forEach(d => container.appendChild(renderPredictionCard(d)));
}

/**
 * Render the Model Confidence badge into #confidence-badge.
 * Uses the top-level model confidence value from prediction.json, not a
 * per-district average (which are all similar and produce a misleading number).
 * @param {number} confidencePct  Top-level model confidence (e.g. 84.2)
 */
function renderConfidenceBadge(confidencePct) {
  const el = document.getElementById('confidence-badge');
  if (!el) return;

  el.innerHTML = '';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-brain';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = `Model Confidence: ${confidencePct}%`;

  el.appendChild(icon);
  el.appendChild(text);
}

/**
 * Render the Top-10 High Risk Districts ordered list.
 * Source: risk.districts sorted descending by riskScore.
 * @param {Array<{name:string, riskScore:number}>} riskDistricts
 */
function renderTop10List(riskDistricts) {
  const list = document.getElementById('top-risk-list');
  if (!list) return;

  list.innerHTML = '';
  const top10 = [...riskDistricts]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  top10.forEach((d, idx) => {
    const li = document.createElement('li');

    const rank = document.createElement('span');
    rank.style.cssText = 'font-weight:700;min-width:1.5rem;color:var(--color-neutral-500);';
    rank.textContent = `${idx + 1}.`;

    const distName = document.createElement('span');
    distName.style.cssText = 'flex:1;font-weight:500;';
    distName.textContent = d.name;

    const barContainer = document.createElement('div');
    barContainer.className = 'risk-bar-container';
    const bar = document.createElement('div');
    bar.className = 'risk-bar';
    bar.style.width = `${d.riskScore}%`;
    bar.style.background = getRiskColor(d.riskScore);
    barContainer.appendChild(bar);

    const badge = document.createElement('span');
    badge.className = `badge ${riskBadgeClass(d.riskScore)}`;
    badge.textContent = getRiskLevel(d.riskScore);

    li.appendChild(rank);
    li.appendChild(distName);
    li.appendChild(barContainer);
    li.appendChild(badge);
    list.appendChild(li);
  });
}

// ============================================================
// Chart builders
// ============================================================

/**
 * Build the Historical vs. Predicted chart.
 *
 * The predicted data comes from summing per-district projectedCover values
 * (63 districts out of 77), so the raw district sums are smaller than the
 * national totals used for historical data. To prevent a visual discontinuity
 * at the 2025→2026 boundary we scale the predicted values so the first
 * predicted point aligns with the last historical point, preserving the
 * trend shape while matching the national magnitude.
 *
 * @param {Array<{year:number, forestCoverHa:number}>} historicalData  2015–2025
 * @param {Array<{year:number, forestCoverHa:number}>} predictedData   2026–2030 (raw district sums)
 */
function buildHistoricalChart(historicalData, predictedData) {
  const canvas = document.getElementById('chart-historical-predicted');
  if (!canvas) return null;

  // Destroy any existing Chart.js instance attached to this canvas
  // to prevent the "Canvas is already in use" console error.
  const existing = typeof Chart !== 'undefined' && Chart.getChart(canvas);
  if (existing) existing.destroy();

  // Scale predicted sums to national magnitude so the lines connect smoothly.
  // ratio = last historical national value / first district-sum predicted value.
  let scaledPredicted = predictedData;
  if (historicalData.length > 0 && predictedData.length > 0) {
    const lastHistorical = historicalData[historicalData.length - 1].forestCoverHa;
    const firstPredicted = predictedData[0].forestCoverHa;
    if (firstPredicted > 0) {
      const ratio = lastHistorical / firstPredicted;
      scaledPredicted = predictedData.map(d => ({
        ...d,
        forestCoverHa: Math.round(d.forestCoverHa * ratio),
      }));
    }
  }

  const histLabels = historicalData.map(d => d.year);
  const predLabels = scaledPredicted.map(d => d.year);
  const allLabels  = [...new Set([...histLabels, ...predLabels])].sort((a, b) => a - b);

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'Actual',
          data: allLabels.map(y => {
            const entry = historicalData.find(d => d.year === y);
            return entry ? entry.forestCoverHa : null;
          }),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.1)',
          borderDash: [],
          tension: 0.3,
          spanGaps: false,
          pointRadius: 4,
        },
        {
          label: 'Predicted',
          data: allLabels.map(y => {
            const entry = scaledPredicted.find(d => d.year === y);
            return entry ? entry.forestCoverHa : null;
          }),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.1)',
          borderDash: [6, 3],
          tension: 0.3,
          spanGaps: false,
          pointRadius: 4,
        },
      ],
    },
    options: {
      animation: { duration: 1000, easing: 'easeInOutQuart' },
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${formatHa(ctx.raw)}` },
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

// ============================================================
// Public API
// ============================================================

/**
 * Highlight the corresponding year on the prediction charts.
 * @param {number} year
 */
export function highlightYearOnChart(year) {
  // Historical chart — highlight the matching point on the Actual dataset
  if (chartHistorical && year >= 2015 && year <= 2025) {
    const idx = chartHistorical.data.labels.indexOf(year);
    if (idx !== -1) {
      chartHistorical.data.datasets[0].pointBackgroundColor =
        chartHistorical.data.labels.map((y, i) => i === idx ? '#7c3aed' : '#16a34a');
      chartHistorical.update('none');
    }
  }
}

/**
 * Initialise the prediction module.
 * Called once from main.js after data:loaded.
 *
 * @param {object} prediction  Parsed prediction.json
 * @param {object} risk        Parsed risk_score.json
 * @param {object} [stats]     Parsed statistics.json (for historical data)
 */
export function init(prediction, risk, stats) {
  if (!prediction) {
    console.warn('[prediction.js] init() called with null prediction — prediction section skipped.');
    return;
  }

  // Sort districts by riskScore descending
  const sortedDistricts = [...(prediction.districts ?? [])]
    .sort((a, b) => b.riskScore - a.riskScore);

  // Render prediction cards (top 5)
  renderPredictionCards(sortedDistricts);

  // Render model confidence badge using the top-level value from prediction.json
  if (prediction.confidencePct != null) {
    renderConfidenceBadge(prediction.confidencePct);
  }

  // Render top-10 list from risk data
  if (risk && risk.districts) {
    renderTop10List(risk.districts);
  } else {
    // Fallback: use prediction districts
    renderTop10List(sortedDistricts.map(d => ({ name: d.name, riskScore: d.riskScore })));
  }

  // Build historical data from stats.yearlyData (2015–2025).
  // If stats failed to load, historicalData will be empty and we show a notice.
  const historicalData = (stats?.yearlyData ?? [])
    .filter(d => d.year >= 2015 && d.year <= 2025);

  if (!stats) {
    console.warn('[prediction.js] stats not available — historical forest cover data missing from chart.');
    // Show a notice inside the chart wrapper so the user knows why the
    // Actual line is absent instead of seeing a mysteriously half-empty chart.
    const canvas = document.getElementById('chart-historical-predicted');
    if (canvas && canvas.parentElement) {
      const notice = document.createElement('p');
      notice.style.cssText = 'font-size:0.8rem;color:var(--color-neutral-500);text-align:center;margin-top:0.5rem;';
      notice.textContent = 'Historical data unavailable — statistics.json failed to load.';
      canvas.parentElement.appendChild(notice);
    }
  }

  // Build predicted national totals per year (2026–2030) from all district projections.
  // Raw values are district-level sums (63/77 districts); buildHistoricalChart will
  // scale them to the national magnitude so the lines connect without a gap.
  const futureYears = [2026, 2027, 2028, 2029, 2030];
  const predictedData = futureYears.map(y => ({
    year: y,
    forestCoverHa: sortedDistricts.reduce((sum, d) => {
      const entry = (d.projectedCover ?? []).find(p => p.year === y);
      return sum + (entry ? entry.forestCoverHa : 0);
    }, 0),
  }));

  // Build charts — destroy any previous instance first to prevent
  // "Canvas is already in use" errors if init() is ever called more than once.
  if (chartHistorical) {
    chartHistorical.destroy();
    chartHistorical = null;
  }
  chartHistorical = buildHistoricalChart(historicalData, predictedData);

  // Subscribe to year:changed
  EventBus.on('year:changed', ({ year }) => highlightYearOnChart(year));
}
