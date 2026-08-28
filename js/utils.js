/**
 * js/utils.js — Pure utility functions
 * Requirements: 8.4, 9.2, 9.7, 21.7
 */

/**
 * Format a number with locale-aware comma separators.
 * @param {number} n
 * @returns {string}  e.g. 1234567 → "1,234,567"
 */
export function formatNumber(n) {
  return Number(n).toLocaleString();
}

/**
 * Format a number as hectares.
 * @param {number} n
 * @returns {string}  e.g. 450000 → "450,000 ha"
 */
export function formatHa(n) {
  return `${formatNumber(n)} ha`;
}

/**
 * Derive risk level label from a 0–100 score.
 * Total function: every integer in [0,100] returns a defined label.
 * @param {number} score  0–100
 * @returns {'Low'|'Medium'|'High'|'Critical'}
 */
export function getRiskLevel(score) {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

/**
 * Return a hex color corresponding to a risk score.
 * @param {number} score  0–100
 * @returns {string}  hex color
 */
export function getRiskColor(score) {
  if (score >= 80) return '#ef4444'; // red   — Critical
  if (score >= 60) return '#f97316'; // orange — High
  if (score >= 40) return '#f59e0b'; // amber  — Medium
  return '#22c55e';                   // green  — Low
}

/**
 * Clamp a value between min and max (inclusive).
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Return a debounced version of fn that delays invocation by `delay` ms.
 * Each new call resets the timer.
 * @param {Function} fn
 * @param {number} delay  milliseconds
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Animate a numeric counter on an element using requestAnimationFrame.
 * Respects prefers-reduced-motion: if set, sets the value immediately.
 * @param {HTMLElement} el        Target element whose textContent will be updated
 * @param {number}      target    Final numeric value
 * @param {number}      [duration=2000]  Animation duration in milliseconds
 */
export function animateCounter(el, target, duration = 2000) {
  // Respect reduced-motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formatNumber(Math.round(target));
    return;
  }

  const start = performance.now();
  const startValue = 0;

  function step(timestamp) {
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startValue + (target - startValue) * eased);

    el.textContent = formatNumber(current);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = formatNumber(Math.round(target));
    }
  }

  requestAnimationFrame(step);
}

/**
 * Filter an array of district names by a query string (case-insensitive substring match).
 * Exported so tests/search.test.js can import and test it in isolation.
 * @param {string[]} names  Array of district name strings
 * @param {string}   query  Search query
 * @returns {string[]}      Matching names
 */
export function filterDistrictNames(names, query) {
  const q = query.toLowerCase();
  return names.filter(n => n.toLowerCase().includes(q));
}
