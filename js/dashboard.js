/**
 * js/dashboard.js — Time Explorer + Year Coordinator
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 *
 * Responsibilities:
 *  - Render interactive year timeline buttons into #year-timeline
 *  - Handle year selection (click + keyboard arrow navigation)
 *  - Emit EventBus 'year:changed' to coordinate all dependent modules
 *  - Default to the most recent year on init
 */

import { EventBus } from './eventbus.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level state
// ─────────────────────────────────────────────────────────────────────────────

/** @type {number[]} Sorted ascending list of available years */
let _years = [];

/** @type {number | null} Currently selected year */
let _activeYear = null;

// ─────────────────────────────────────────────────────────────────────────────
// Exported helpers (used directly and exposed for testability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the most recent (maximum) year present in yearlyData.
 * @param {Array<{ year: number }>} yearlyData
 * @returns {number}
 */
export function getDefaultYear(yearlyData) {
  const years = yearlyData.map(entry => entry.year);
  return Math.max(...years);
}

/**
 * Filter yearlyData entries whose year falls within [start, end] inclusive.
 * @param {Array<{ year: number }>} yearlyData
 * @param {number} start
 * @param {number} end
 * @returns {Array<{ year: number }>}
 */
export function filterByYearRange(yearlyData, start, end) {
  return yearlyData.filter(entry => entry.year >= start && entry.year <= end);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the year button element for a given year.
 * @param {number} year
 * @returns {HTMLButtonElement | null}
 */
function _getButton(year) {
  return document.querySelector(`#year-timeline .year-btn[data-year="${year}"]`);
}

/**
 * Return the index of a year within the sorted _years array, or -1.
 * @param {number} year
 * @returns {number}
 */
function _yearIndex(year) {
  return _years.indexOf(year);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core year selection logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select a year:
 *  1. Update active button styling.
 *  2. Apply .section-transitioning to dependent sections.
 *  3. Emit EventBus 'year:changed'.
 *  4. Remove .section-transitioning after 300ms.
 * @param {number} year
 */
export function selectYear(year) {
  _activeYear = year;

  // 1. Update button active states
  const container = document.getElementById('year-timeline');
  if (container) {
    container.querySelectorAll('.year-btn').forEach(btn => {
      btn.classList.toggle('year-btn--active', Number(btn.dataset.year) === year);
    });
  }

  // 2. Add transitioning class to dependent sections
  const transitionSections = ['analytics', 'statistics', 'insights', 'prediction'];
  transitionSections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('section-transitioning');
  });

  // 3. Emit year:changed event for all module consumers
  EventBus.emit('year:changed', { year });

  // 4. Remove transitioning class after 300ms
  setTimeout(() => {
    transitionSections.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('section-transitioning');
    });
  }, 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render year buttons into #year-timeline.
 * @param {number[]} years  Sorted ascending array of years.
 */
function _renderTimeline(years) {
  const container = document.getElementById('year-timeline');
  if (!container) {
    console.warn('[dashboard] #year-timeline element not found');
    return;
  }

  // Clear any previous content
  container.innerHTML = '';

  // Build a flex-row of year buttons
  years.forEach(year => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'year-btn';
    btn.dataset.year = String(year);
    btn.textContent = String(year);

    btn.addEventListener('click', () => {
      selectYear(year);
    });

    container.appendChild(btn);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard navigation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wire ArrowRight / ArrowLeft keyboard navigation on the timeline container.
 */
function _wireKeyboardNavigation() {
  const container = document.getElementById('year-timeline');
  if (!container) return;

  container.addEventListener('keydown', (event) => {
    if (_years.length === 0 || _activeYear === null) return;

    const currentIndex = _yearIndex(_activeYear);

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex < _years.length) {
        const nextYear = _years[nextIndex];
        selectYear(nextYear);
        // Move focus to the newly active button
        const btn = _getButton(nextYear);
        if (btn) btn.focus();
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        const prevYear = _years[prevIndex];
        selectYear(prevYear);
        // Move focus to the newly active button
        const btn = _getButton(prevYear);
        if (btn) btn.focus();
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise the Time Explorer.
 * @param {Array<{ year: number }>} yearlyData  Array of yearly data objects.
 */
export function init(yearlyData) {
  if (!yearlyData || yearlyData.length === 0) {
    console.warn('[dashboard] init called with empty yearlyData');
    return;
  }

  // Extract unique years, sort ascending
  const uniqueYears = [...new Set(yearlyData.map(entry => entry.year))].sort((a, b) => a - b);
  _years = uniqueYears;

  // Render timeline buttons
  _renderTimeline(_years);

  // Wire keyboard navigation
  _wireKeyboardNavigation();

  // Default to most recent year
  const defaultYear = getDefaultYear(yearlyData);
  selectYear(defaultYear);
}
