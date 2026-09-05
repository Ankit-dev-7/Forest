/**
 * js/prediction.js — Prediction Dashboard module
 * Renders top-10 risk list.
 * Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import { getRiskColor, getRiskLevel } from './utils.js';

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

  // Render top-10 list from risk data
  if (risk && risk.districts) {
    renderTop10List(risk.districts);
  } else {
    // Fallback: use prediction districts
    renderTop10List(sortedDistricts.map(d => ({ name: d.name, riskScore: d.riskScore })));
  }
}
