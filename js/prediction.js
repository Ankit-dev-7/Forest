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

/** @type {Chart|null} Future Forest Cover chart */
let chartFuture = null;

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
 * @param {Array<{confidencePct:number}>} districts
 */
function renderConfidenceBadge(districts) {
  const el = document.getElementById('confidence-badge');
  if (!el) return;

  const avg = districts.length
    ? Math.round(districts.reduce((sum, d) => sum + (d.confidencePct ?? 0), 0) / districts.length)
    : 0;

  el.innerHTML = '';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-brain';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = `Model Confidence: ${avg}%`;

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
 * @param {Array<{year:number, forestCoverHa:number}>} historicalData  2015–2025
 * @param {Array<{year:number, forestCoverHa:number}>} predictedData   2026–2030
 */
function buildHistoricalChart(historicalData, predictedData) {
  const canvas = document.getElementById('chart-historical-predicted');
  if (!canvas) return null;

  const histLabels = historicalData.map(d => d.year);
  const predLabels = predictedData.map(d => d.year);
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
            const entry = predictedData.find(d => d.year === y);
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

/**
 * Build the Future Forest Cover chart (aggregated projections 2026–2030).
 * @param {Array<{projectedCover: Array<{year:number, forestCoverHa:number}>}>} districtList
 */
function buildFutureChart(districtList) {
  const canvas = document.getElementById('chart-future-cover');
  if (!canvas) return null;

  const futureYears = [2026, 2027, 2028, 2029, 2030];

  const totals = futureYears.map(y => {
    return districtList.reduce((sum, d) => {
      const entry = (d.projectedCover ?? []).find(p => p.year === y);
      return sum + (entry ? entry.forestCoverHa : 0);
    }, 0);
  });

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: futureYears,
      datasets: [{
        label: 'Projected Forest Cover',
        data: totals,
        backgroundColor: 'rgba(245,158,11,0.7)',
        borderColor: '#f59e0b',
        borderWidth: 1,
      }],
    },
    options: {
      animation: { duration: 1000, easing: 'easeInOutQuart' },
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: { label: ctx => formatHa(ctx.raw) },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Projected Forest Cover (ha)' },
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

  // Future chart — highlight the corresponding bar
  if (chartFuture && year >= 2026 && year <= 2030) {
    const idx = chartFuture.data.labels.indexOf(year);
    if (idx !== -1) {
      chartFuture.data.datasets[0].backgroundColor =
        chartFuture.data.labels.map((y, i) => i === idx ? '#7c3aed' : 'rgba(245,158,11,0.7)');
      chartFuture.update('none');
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

  // Render confidence badge
  renderConfidenceBadge(prediction.districts ?? []);

  // Render top-10 list from risk data
  if (risk && risk.districts) {
    renderTop10List(risk.districts);
  } else {
    // Fallback: use prediction districts
    renderTop10List(sortedDistricts.map(d => ({ name: d.name, riskScore: d.riskScore })));
  }

  // Build historical data from stats.yearlyData (2015–2025)
  const historicalData = (stats?.yearlyData ?? [])
    .filter(d => d.year >= 2015 && d.year <= 2025);

  // Build predicted national totals per year (2026–2030) from all district projections
  const futureYears = [2026, 2027, 2028, 2029, 2030];
  const predictedData = futureYears.map(y => ({
    year: y,
    forestCoverHa: sortedDistricts.reduce((sum, d) => {
      const entry = (d.projectedCover ?? []).find(p => p.year === y);
      return sum + (entry ? entry.forestCoverHa : 0);
    }, 0),
  }));

  // Build charts
  chartHistorical = buildHistoricalChart(historicalData, predictedData);
  chartFuture     = buildFutureChart(prediction.districts ?? []);

  // Subscribe to year:changed
  EventBus.on('year:changed', ({ year }) => highlightYearOnChart(year));
}
