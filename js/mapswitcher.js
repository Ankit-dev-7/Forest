/**
 * js/mapswitcher.js — QGIS map iframe loader
 *
 * The Forest Monitoring Map (Panel 1) has been removed.
 * This module now simply loads the QGIS2Web iframe on init.
 */

// Path to the QGIS2Web index.html (relative to the website root)
const QGIS_MAP_SRC =
  'webmap/webmap/qgis2web_2026_09_18-02_13_55_231242/index.html';

/**
 * Initialise the QGIS map iframe.
 * Called once after DOMContentLoaded.
 */
export function init() {
  const iframe  = document.getElementById('qgis-map-frame');
  const loading = document.getElementById('qgis-map-loading');

  if (!iframe) return;

  iframe.addEventListener('load', () => {
    iframe.classList.add('map-iframe--loaded');
    if (loading) loading.classList.add('map-iframe-loading--hidden');
  });

  // Load the QGIS map immediately
  iframe.src = QGIS_MAP_SRC;
}
