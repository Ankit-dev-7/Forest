/**
 * js/main.js — Application entry point and EventBus
 * Requirements: 1.4, 2.6, 20.2, 20.5
 */

// ============================================================
// EventBus — imported for local use, and re-exported for consumers
// ============================================================

import { EventBus } from './eventbus.js';

// ============================================================
// Module imports
// ============================================================

import { loadAll } from './loader.js';
import { init as initUI } from './ui.js';
import { initContactForm } from './ui.js';
import { init as initDashboard } from './dashboard.js';
import { init as initAnalytics } from './analytics.js';
import { init as initMapSwitcher } from './mapswitcher.js';

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {

  // Mark HTML as JS-active so the section reveal animation kicks in
  document.documentElement.classList.add('js-loaded');

  // Reveal sections: immediately show any section already in the viewport,
  // mark the rest as section-hidden so they can animate in on scroll.
  // Hero is always shown immediately.
  document.querySelectorAll('section').forEach(sec => {
    const rect = sec.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewport || sec.id === 'hero') {
      sec.classList.add('revealed');
    } else {
      sec.classList.add('section-hidden');
    }
  });

  // Safety fallback: reveal ALL sections after 5s regardless
  const revealFallback = setTimeout(() => {
    document.querySelectorAll('section').forEach(s => {
      s.classList.remove('section-hidden');
      s.classList.add('revealed');
    });
  }, 5000);

  // Wire the footer year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Wire the contact form (Web3Forms)
  initContactForm();

  // ── QGIS map iframe loader (no data dependency) ──
  initMapSwitcher();

  // data:loaded — initialise all modules in dependency order
  EventBus.on('data:loaded', ({ stats, districtGeo }) => {
    clearTimeout(revealFallback); // data loaded — cancel safety fallback

    // 1. UI first — renders skeleton → real stat cards, wires navbar/slider/reveals
    if (stats) initUI(stats, districtGeo);

    // 2. Analytics Dashboard — owns all chart canvas IDs (chart-trend,
    //    chart-loss, chart-gain, chart-composition). The province chart is
    //    a pure SVG radial chart rendered into #province-radial-wrap.
    if (stats) initAnalytics(stats);

    // 3. Dashboard (Time Explorer) — emits year:changed(defaultYear) last,
    //    which analytics.js subscribes to.
    if (stats && stats.yearlyData) {
      initDashboard(stats.yearlyData);
    }
  });

  // data:error — show non-blocking toast per failed file
  EventBus.on('data:error', ({ file, error }) => {
    // showErrorToast may not be available if ui.js failed; guard it
    import('./ui.js').then(({ showErrorToast }) => {
      showErrorToast(`Failed to load ${file}: ${error.message}`);
    }).catch(() => {
      console.error(`[Loader] Failed to load ${file}:`, error);
    });
  });

  // Trigger all fetches — loader emits events on completion
  await loadAll();
});
