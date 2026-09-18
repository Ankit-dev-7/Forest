/**
 * js/mapswitcher.js — Map 1 / Map 2 tab switcher
 *
 * Handles:
 *  - Tab button active state (aria + visual)
 *  - Show / hide map panels
 *  - Lazy-load the QGIS2Web iframe on first Map 2 click
 *  - Emit map:invalidate on the EventBus when returning to Map 1
 *    so Leaflet can recalculate tile positions after being hidden
 */

import { EventBus } from './eventbus.js';

// Path to the QGIS2Web index.html (relative to the website root)
const QGIS_MAP_SRC =
  'webmap/webmap/qgis2web_2026_09_18-02_13_55_231242/index.html';

/**
 * Initialise the map tab switcher.
 * Called once after DOMContentLoaded.
 */
export function init() {
  const tab1    = document.getElementById('map-tab-1');
  const tab2    = document.getElementById('map-tab-2');
  const panel1  = document.getElementById('map-panel-1');
  const panel2  = document.getElementById('map-panel-2');
  const iframe  = document.getElementById('qgis-map-frame');
  const loading = document.getElementById('qgis-map-loading');

  if (!tab1 || !tab2 || !panel1 || !panel2 || !iframe) return;

  let iframeLoaded  = false;
  let iframeSrcSet  = false;  // guard: browsers normalize empty src to current URL

  // ── Wire iframe load event ────────────────────────────────────
  iframe.addEventListener('load', () => {
    iframeLoaded = true;
    iframe.classList.add('map-iframe--loaded');
    if (loading) loading.classList.add('map-iframe-loading--hidden');
  });

  // ── Handle Map 2 tab min-height sync ─────────────────────────
  // Keep the iframe wrapper height in sync with map-panel-1's height so
  // both maps occupy the same space in the layout.
  function syncIframeHeight() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;
    const h = mapContainer.offsetHeight;
    if (h > 0) {
      const wrap = panel2.querySelector('.map-iframe-wrap');
      if (wrap) {
        wrap.style.minHeight = h + 'px';
        iframe.style.minHeight = h + 'px';
      }
    }
  }

  // ── Tab switch logic ──────────────────────────────────────────
  function activateTab(tabId) {
    const goingTo2 = tabId === '2';

    // Update tab button states
    tab1.classList.toggle('map-tab--active', !goingTo2);
    tab2.classList.toggle('map-tab--active',  goingTo2);
    tab1.setAttribute('aria-selected', String(!goingTo2));
    tab2.setAttribute('aria-selected', String( goingTo2));

    // Show / hide panels
    if (goingTo2) {
      panel1.hidden = true;
      panel1.classList.remove('map-panel--active');
      panel2.hidden = false;
      panel2.classList.add('map-panel--active');

      // Lazy-load: set src only on first activation
      if (!iframeSrcSet) {
        iframeSrcSet = true;
        syncIframeHeight();
        iframe.src = QGIS_MAP_SRC;
      } else if (iframeLoaded) {
        // Already loaded — just ensure loading overlay stays hidden
        if (loading) loading.classList.add('map-iframe-loading--hidden');
      } else {
        // src already set but still loading — show loading overlay
        if (loading) loading.classList.remove('map-iframe-loading--hidden');
      }
    } else {
      panel2.hidden = true;
      panel2.classList.remove('map-panel--active');
      panel1.hidden = false;
      panel1.classList.add('map-panel--active');

      // Tell Map 1 (Leaflet) to recalculate its container size
      // since it was hidden while Map 2 was active
      EventBus.emit('map:invalidate');
    }
  }

  // ── Attach click listeners ────────────────────────────────────
  tab1.addEventListener('click', () => activateTab('1'));
  tab2.addEventListener('click', () => activateTab('2'));

  // ── Keyboard: arrow keys navigate between tabs (ARIA pattern) ──
  [tab1, tab2].forEach((btn, i) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = i === 0 ? tab2 : tab1;
        next.focus();
        activateTab(next.dataset.mapTab);
      }
    });
  });
}
