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
  if (score >= 80) return 'risk-badge--critical';
  if (score >= 60) return 'risk-badge--high';
  if (score >= 40) return 'risk-badge--medium';
  return 'risk-badge--low';
}

function riskBadgeLabel(score) {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

/**
 * Render the Top-10 High Risk Districts list.
 * @param {Array<{name:string, riskScore:number}>} riskDistricts
 */
function renderTop10List(riskDistricts) {
  const wrapper = document.getElementById('top-risk-list-wrapper');
  const list    = document.getElementById('top-risk-list');
  if (!list || !wrapper) return;

  // Inject the legend badge once
  if (!wrapper.querySelector('.risk-legend-badge')) {
    const legend = document.createElement('div');
    legend.className = 'risk-legend-badge';
    legend.innerHTML =
      '<span class="risk-legend-dot"></span>' +
      'Composite Risk Index (0–100) · DFRS 2015 + FAO';
    wrapper.insertBefore(legend, list);
  }

  list.innerHTML = '';
  const top10 = [...riskDistricts]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  top10.forEach((d, idx) => {
    const li = document.createElement('li');
    li.className = 'risk-row';

    li.innerHTML = `
      <span class="risk-row__rank">${idx + 1}.</span>
      <span class="risk-row__name">${d.name}</span>
      <div class="risk-row__bar-wrap">
        <div class="risk-row__bar" style="width:${d.riskScore}%;background:${getRiskColor(d.riskScore)};"></div>
      </div>
      <span class="risk-row__score">${d.riskScore}</span>
      <span class="risk-row__badge ${riskBadgeClass(d.riskScore)}">${riskBadgeLabel(d.riskScore)}</span>
    `;

    list.appendChild(li);
  });
}

// ============================================================
// Public API
// ============================================================

/**
 * Initialise the prediction module.
 * @param {object} prediction  Parsed prediction.json
 * @param {object} risk        Parsed risk_score.json
 */
export function init(prediction, risk) {
  if (!prediction) {
    console.warn('[prediction.js] init() called with null prediction — prediction section skipped.');
    return;
  }

  const sortedDistricts = [...(prediction.districts ?? [])]
    .sort((a, b) => b.riskScore - a.riskScore);

  if (risk && risk.districts) {
    renderTop10List(risk.districts);
  } else {
    renderTop10List(sortedDistricts.map(d => ({ name: d.name, riskScore: d.riskScore })));
  }
}
