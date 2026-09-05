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
    li.style.cssText = 'margin-bottom: 12px !important;';

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
// Public API
// ============================================================

/**
 * Initialise the prediction module.
 * Called once from main.js after data:loaded.
 *
 * @param {object} prediction  Parsed prediction.json
 * @param {object} risk        Parsed risk_score.json
 */
export function init(prediction, risk) {
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
}
