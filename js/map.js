/**
 * js/map.js — GIS Map module
 * Leaflet map with real GADM Nepal boundary data and QGIS-matching styling.
 *
 * Layers (matching QGIS project deforestation_watch.qgz):
 *  - OpenStreetMap base  (QGIS: OpenStreetMap XYZ tile layer)
 *  - Satellite base      (Esri World Imagery)
 *  - Province Boundaries (QGIS: gadm41_NPL_2 — red fill → adapted as outline-only)
 *  - District Boundaries (QGIS: gadm41_NPL_3 — Set3 categorised → adapted as risk choropleth)
 *  - Forest Loss Choropleth (QGIS: Forest Loss 2015-Present YlOrRd ramp, val 1–23)
 *  - Risk Heat Map (derived from risk_score.json)
 *
 * NOTE: Leaflet (L) is a CDN global — not imported.
 */

import { EventBus } from './eventbus.js';
import { getRiskColor, getRiskLevel, formatHa, formatNumber } from './utils.js';

// ─────────────────────────────────────────────────────────────
// Module-level state
// ─────────────────────────────────────────────────────────────

/** @type {L.Map|null} */
let map = null;

/** @type {object|null} */
let districtGeoData  = null;
/** @type {object|null} */
let forestGeoData    = null;
/** @type {object|null} */
let riskData         = null;
/** @type {object|null} */
let provinceGeoData  = null;

/** @type {L.GeoJSON|null} Raw district GeoJSON layer (used by search) */
let adminGeoJsonLayer = null;

// Nepal geographic constants
const NEPAL_CENTER    = [28.3949, 84.1240];
const DEFAULT_ZOOM    = 7;
const NEPAL_BOUNDS    = [[26.30, 79.80], [30.55, 88.35]];

// ─────────────────────────────────────────────────────────────
// QGIS-matching colour helpers
// ─────────────────────────────────────────────────────────────

/**
 * QGIS Forest Loss colour ramp: YlOrRd (yellow → orange → red)
 * Matches the ramp used for "Forest Loss 2015-Present" and
 * "nepal_lossyear_clipped" layers in deforestation_watch.qgz.
 * Input: forest loss in ha (district attribute).
 * We map loss values to the five QGIS colour stops.
 *
 * QGIS stops (value = % of max loss in district data):
 *   Stop 1: #ffffb2  (lightest yellow)
 *   Stop 2: #fecc5c
 *   Stop 3: #fd8d3c
 *   Stop 4: #f03b20
 *   Stop 5: #bd0026  (darkest red)
 */
const YLORD_STOPS = [
  { pct: 0.00, color: '#ffffb2' },
  { pct: 0.25, color: '#fecc5c' },
  { pct: 0.50, color: '#fd8d3c' },
  { pct: 0.75, color: '#f03b20' },
  { pct: 1.00, color: '#bd0026' },
];

/**
 * Linearly interpolate two hex colours at t ∈ [0, 1].
 * @param {string} c1 hex colour e.g. '#ffffb2'
 * @param {string} c2 hex colour
 * @param {number} t  0–1
 * @returns {string} interpolated hex colour
 */
function lerpColor(c1, c2, t) {
  const h = s => parseInt(s, 16);
  const r1 = h(c1.slice(1, 3)), g1 = h(c1.slice(3, 5)), b1 = h(c1.slice(5, 7));
  const r2 = h(c2.slice(1, 3)), g2 = h(c2.slice(3, 5)), b2 = h(c2.slice(5, 7));
  const r  = Math.round(r1 + (r2 - r1) * t);
  const g  = Math.round(g1 + (g2 - g1) * t);
  const b  = Math.round(b1 + (b2 - b1) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Map a normalised value [0..1] through the QGIS YlOrRd ramp.
 * @param {number} t  0–1
 * @returns {string}  hex colour
 */
function ylordColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < YLORD_STOPS.length; i++) {
    const s0 = YLORD_STOPS[i - 1], s1 = YLORD_STOPS[i];
    if (t <= s1.pct) {
      const localT = (t - s0.pct) / (s1.pct - s0.pct);
      return lerpColor(s0.color, s1.color, localT);
    }
  }
  return YLORD_STOPS[YLORD_STOPS.length - 1].color;
}

/**
 * Compute the forest-loss fill colour for a district feature
 * using the QGIS YlOrRd ramp.
 * @param {object} props  GeoJSON feature.properties
 * @param {number} maxLoss  Maximum loss value across all districts
 * @returns {string}  hex colour
 */
function forestLossColor(props, maxLoss) {
  const loss = props.forestLossHa ?? 0;
  return ylordColor(maxLoss > 0 ? loss / maxLoss : 0);
}

// Province colours — matched to QGIS Set3 palette adapted for web
// (QGIS uses Set3 for gadm41_NPL_3 categorised renderer)
const PROVINCE_COLORS = {
  'Koshi':          '#8dd3c7',
  'Madhesh':        '#ffffb3',
  'Bagmati':        '#bebada',
  'Gandaki':        '#fb8072',
  'Lumbini':        '#80b1d3',
  'Karnali':        '#fdb462',
  'Sudurpashchim':  '#b3de69',
};

// ─────────────────────────────────────────────────────────────
// Layer style factories
// ─────────────────────────────────────────────────────────────

/**
 * Style for district boundaries (default — thin grey stroke, no fill).
 * Used as the base administrative boundary layer.
 */
const DISTRICT_BASE_STYLE = {
  color:       '#5a7a6a',
  weight:      0.8,
  fillOpacity: 0,
  opacity:     0.7,
  dashArray:   null,
};

/**
 * Hover style for district boundaries.
 */
const DISTRICT_HOVER_STYLE = {
  color:   '#0ea5e9',
  weight:  2.5,
};

/**
 * Style for province boundaries.
 * QGIS source: gadm41_NPL_2 — singleSymbol fill rgb(196,60,57), outline rgb(35,35,35).
 * Adapted for web overlay: transparent fill, bold dark-red stroke.
 */
const PROVINCE_STYLE = {
  color:       '#c43c39',   // matches QGIS fill color rgb(196,60,57) used as border
  weight:      2.2,
  fillOpacity: 0,
  opacity:     0.95,
  dashArray:   null,
};

// ─────────────────────────────────────────────────────────────
// Popup builder
// ─────────────────────────────────────────────────────────────

/**
 * Build an accessible popup DOM node for a district click.
 * @param {object} p  feature.properties
 * @returns {HTMLElement}
 */
function buildDistrictPopup(p) {
  const riskScore = p.riskScore ?? 0;
  const riskLevel = getRiskLevel(riskScore);
  const riskCol   = getRiskColor(riskScore);
  const trend     = p.trend != null ? `${Number(p.trend).toFixed(2)}%` : 'N/A';
  const trendDir  = (p.trend ?? 0) >= 0 ? '▲' : '▼';
  const trendCls  = (p.trend ?? 0) >= 0 ? 'popup-trend--up' : 'popup-trend--down';

  const container = document.createElement('div');
  container.className = 'map-popup';

  // Header
  const header = document.createElement('div');
  header.className = 'map-popup__header';
  const titleEl = document.createElement('h4');
  titleEl.className = 'map-popup__title';
  titleEl.textContent = p.name ?? 'Unknown';
  const provEl = document.createElement('span');
  provEl.className = 'map-popup__province';
  provEl.textContent = p.province ?? '';
  header.appendChild(titleEl);
  header.appendChild(provEl);
  container.appendChild(header);

  // Risk badge
  const badge = document.createElement('div');
  badge.className = 'map-popup__risk-badge';
  badge.style.setProperty('--risk-color', riskCol);
  badge.innerHTML = `<span class="map-popup__risk-dot" style="background:${riskCol}"></span>
    <span class="map-popup__risk-label">${riskLevel} Risk</span>
    <span class="map-popup__risk-score">${formatNumber(riskScore)}</span>`;
  container.appendChild(badge);

  // Stats grid
  const grid = document.createElement('div');
  grid.className = 'map-popup__grid';
  const stats = [
    { label: 'Forest Cover', value: formatHa(p.forestCoverHa ?? 0), cls: 'cover' },
    { label: 'Forest Loss',  value: formatHa(p.forestLossHa  ?? 0), cls: 'loss'  },
    { label: 'Forest Gain',  value: formatHa(p.forestGainHa  ?? 0), cls: 'gain'  },
  ];
  stats.forEach(({ label, value, cls }) => {
    const item = document.createElement('div');
    item.className = `map-popup__stat map-popup__stat--${cls}`;
    item.innerHTML = `<span class="map-popup__stat-label">${label}</span>
      <span class="map-popup__stat-value">${value}</span>`;
    grid.appendChild(item);
  });
  container.appendChild(grid);

  // Trend
  const trendEl = document.createElement('div');
  trendEl.className = `map-popup__trend ${trendCls}`;
  trendEl.innerHTML = `<span>${trendDir} Annual Trend: ${trend}</span>`;
  container.appendChild(trendEl);

  return container;
}

// ─────────────────────────────────────────────────────────────
// Custom Controls
// ─────────────────────────────────────────────────────────────

/** Fullscreen toggle control */
const FullscreenControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-fullscreen-control');
    const btn = L.DomUtil.create('a', 'custom-fullscreen-btn', container);
    btn.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
    btn.title = 'Toggle fullscreen';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Toggle fullscreen');
    btn.setAttribute('tabindex', '0');
    btn.href = '#';
    L.DomEvent.disableClickPropagation(container);
    let isFullscreen = false;
    const toggle = (e) => {
      L.DomEvent.preventDefault(e);
      const mapEl = document.getElementById('map-container');
      if (!mapEl) return;
      isFullscreen = !isFullscreen;
      mapEl.classList.toggle('map-fullscreen', isFullscreen);
      btn.innerHTML = isFullscreen
        ? '<i class="fa-solid fa-compress" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
      btn.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen');
      setTimeout(() => mapInstance.invalidateSize(), 100);
    };
    L.DomEvent.on(btn, 'click', toggle);
    L.DomEvent.on(btn, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isFullscreen) toggle(e); });
    return container;
  },
});

/** Reset-to-Nepal-view control */
const ResetViewControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-reset-control');
    const btn = L.DomUtil.create('a', 'custom-reset-btn', container);
    btn.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>';
    btn.title = 'Reset map view to Nepal';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Reset map view');
    btn.setAttribute('tabindex', '0');
    btn.href = '#';
    L.DomEvent.disableClickPropagation(container);
    const reset = (e) => {
      L.DomEvent.preventDefault(e);
      mapInstance.setView(NEPAL_CENTER, DEFAULT_ZOOM);
    };
    L.DomEvent.on(btn, 'click', reset);
    L.DomEvent.on(btn, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') reset(e); });
    return container;
  },
});

/** Custom zoom control */
const CustomZoomControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-zoom-control');
    const zoomIn  = L.DomUtil.create('a', 'custom-zoom-in',  container);
    const zoomOut = L.DomUtil.create('a', 'custom-zoom-out', container);
    zoomIn.innerHTML  = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    zoomOut.innerHTML = '<i class="fa-solid fa-minus" aria-hidden="true"></i>';
    zoomIn.title  = 'Zoom in';  zoomIn.href  = '#'; zoomIn.setAttribute('role','button'); zoomIn.setAttribute('tabindex','0');
    zoomOut.title = 'Zoom out'; zoomOut.href = '#'; zoomOut.setAttribute('role','button'); zoomOut.setAttribute('tabindex','0');
    L.DomEvent.disableClickPropagation(container);
    const zIn  = (e) => { L.DomEvent.preventDefault(e); mapInstance.zoomIn();  };
    const zOut = (e) => { L.DomEvent.preventDefault(e); mapInstance.zoomOut(); };
    L.DomEvent.on(zoomIn,  'click',   zIn);
    L.DomEvent.on(zoomOut, 'click',   zOut);
    L.DomEvent.on(zoomIn,  'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') zIn(e);  });
    L.DomEvent.on(zoomOut, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') zOut(e); });
    return container;
  },
});

/** District search control */
const DistrictSearchControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-control district-search-control');
    container.setAttribute('role', 'search');
    container.setAttribute('aria-label', 'District search');
    const input = L.DomUtil.create('input', 'district-search-input', container);
    input.type = 'text';
    input.placeholder = 'Search district…';
    input.setAttribute('aria-label', 'Search for a district');
    input.setAttribute('autocomplete', 'off');
    const list = L.DomUtil.create('ul', 'district-search-list', container);
    list.setAttribute('role', 'listbox');
    list.style.display = 'none';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const updateSuggestions = (query) => {
      list.innerHTML = '';
      if (!query || !districtGeoData) { list.style.display = 'none'; return; }
      const q = query.toLowerCase();
      const matches = districtGeoData.features
        .filter(f => f.properties?.name?.toLowerCase().includes(q))
        .slice(0, 8);
      if (!matches.length) { list.style.display = 'none'; return; }
      matches.forEach(feature => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = feature.properties.name;
        li.style.cssText = 'padding:0.4rem 0.75rem;cursor:pointer;font-size:0.8rem;';
        li.addEventListener('mouseenter', () => { li.style.background = '#f1f5f9'; });
        li.addEventListener('mouseleave', () => { li.style.background = ''; });
        li.addEventListener('click', () => { input.value = feature.properties.name; list.style.display = 'none'; selectDistrict(feature); });
        list.appendChild(li);
      });
      list.style.display = 'block';
    };

    const selectDistrict = (feature) => {
      if (!adminGeoJsonLayer) return;
      let targetLayer = null;
      adminGeoJsonLayer.eachLayer(l => {
        if (l.feature?.properties?.name === feature.properties.name) targetLayer = l;
      });
      if (targetLayer) {
        mapInstance.fitBounds(targetLayer.getBounds(), { padding: [30, 30] });
        targetLayer.setStyle({ color: '#0ea5e9', weight: 3, fillOpacity: 0.15, fillColor: '#0ea5e9' });
        setTimeout(() => adminGeoJsonLayer.resetStyle(targetLayer), 2500);
      }
    };

    input.addEventListener('input',   (e) => updateSuggestions(e.target.value.trim()));
    input.addEventListener('keydown',  (e) => { if (e.key === 'Escape') { list.style.display = 'none'; input.value = ''; } });
    document.addEventListener('click', (e) => { if (!container.contains(e.target)) list.style.display = 'none'; });
    return container;
  },
});

// ─────────────────────────────────────────────────────────────
// Legend control (QGIS-accurate)
// ─────────────────────────────────────────────────────────────

/**
 * Build a professional legend matching QGIS layer styling.
 * Shows the YlOrRd forest-loss ramp with 5 class breaks,
 * province boundary swatch, and district boundary swatch.
 */
const MapLegendControl = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.setAttribute('aria-label', 'Map legend');
    div.setAttribute('role', 'complementary');

    // Build YlOrRd gradient swatch for forest loss
    const rampStops = YLORD_STOPS.map(s => s.color).join(', ');

    div.innerHTML = `
      <h4 class="map-legend__title">
        <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
        Legend
      </h4>

      <div class="map-legend__section">
        <p class="map-legend__section-title">Forest Loss Intensity</p>
        <div class="map-legend__ramp-wrap">
          <div class="map-legend__ramp" style="background: linear-gradient(to right, ${rampStops})" aria-hidden="true"></div>
          <div class="map-legend__ramp-labels">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
        <ul class="map-legend__list" role="list">
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#ffffb2;border:1px solid #ccc" aria-hidden="true"></span>
            <span>&lt; 20 ha / yr</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#fecc5c" aria-hidden="true"></span>
            <span>20 – 50 ha / yr</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#fd8d3c" aria-hidden="true"></span>
            <span>50 – 80 ha / yr</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#f03b20" aria-hidden="true"></span>
            <span>80 – 110 ha / yr</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#bd0026" aria-hidden="true"></span>
            <span>&gt; 110 ha / yr</span>
          </li>
        </ul>
      </div>

      <div class="map-legend__section">
        <p class="map-legend__section-title">Boundaries</p>
        <ul class="map-legend__list" role="list">
          <li class="map-legend__item">
            <span class="map-legend__swatch map-legend__swatch--border"
                  style="border: 2.5px solid #c43c39; background: transparent" aria-hidden="true"></span>
            <span>Province Boundary</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch map-legend__swatch--border"
                  style="border: 1px solid #5a7a6a; background: transparent" aria-hidden="true"></span>
            <span>District Boundary</span>
          </li>
        </ul>
      </div>

      <div class="map-legend__section" id="map-legend-risk-section" style="display:none">
        <p class="map-legend__section-title">Deforestation Risk</p>
        <ul class="map-legend__list" role="list">
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#22c55e" aria-hidden="true"></span>
            <span>Low (&lt; 40)</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#f59e0b" aria-hidden="true"></span>
            <span>Medium (40–59)</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#f97316" aria-hidden="true"></span>
            <span>High (60–79)</span>
          </li>
          <li class="map-legend__item">
            <span class="map-legend__swatch" style="background:#ef4444" aria-hidden="true"></span>
            <span>Critical (≥ 80)</span>
          </li>
        </ul>
      </div>

      <p class="map-legend__source">
        Source: GADM v4.1 · GFC Hansen et al.
      </p>
    `;

    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  },
});

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Initialise the Leaflet map with real GADM Nepal boundary data.
 *
 * @param {object|null} districtGeo  GeoJSON FeatureCollection — all 77 districts
 * @param {object|null} forestGeo    GeoJSON FeatureCollection — forest cover/loss/gain
 * @param {object|null} risk         Parsed risk_score.json
 * @param {object|null} provinceGeo  GeoJSON FeatureCollection — 7 provinces
 */
export function init(districtGeo, forestGeo, risk, provinceGeo) {
  districtGeoData = districtGeo;
  forestGeoData   = forestGeo;
  riskData        = risk;
  provinceGeoData = provinceGeo;

  // ── Create map ──────────────────────────────────────────────
  map = L.map('map-container', {
    zoomControl:          false,
    center:               NEPAL_CENTER,
    zoom:                 DEFAULT_ZOOM,
    minZoom:              6,
    maxZoom:              17,
    maxBounds:            L.latLngBounds(NEPAL_BOUNDS[0], NEPAL_BOUNDS[1]),
    maxBoundsViscosity:   0.85,
  });

  // ── Base tile layers ────────────────────────────────────────
  // OpenStreetMap — matches QGIS base layer
  const osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }
  ).addTo(map);

  // Esri World Imagery (satellite)
  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }
  );

  const baseLayers = {
    '<i class="fa-solid fa-map" aria-hidden="true"></i>&nbsp;OpenStreetMap': osmLayer,
    '<i class="fa-solid fa-satellite" aria-hidden="true"></i>&nbsp;Satellite': satelliteLayer,
  };

  // ── Compute max loss for YlOrRd normalisation ───────────────
  let maxLoss = 1;
  if (districtGeo?.features) {
    maxLoss = Math.max(1, ...districtGeo.features.map(f => f.properties?.forestLossHa ?? 0));
  }

  // ── 1. Forest Loss Choropleth layer (QGIS: Forest Loss 2015-Present) ──
  //    Fills each district with YlOrRd ramp keyed to forestLossHa.
  //    This is the primary QGIS data visualisation layer.
  let forestLossLayer = L.geoJSON();
  if (districtGeo?.features) {
    forestLossLayer = L.geoJSON(districtGeo, {
      style(feature) {
        const p = feature.properties ?? {};
        return {
          fillColor:   forestLossColor(p, maxLoss),
          fillOpacity: 0.78,
          color:       '#4a6358',
          weight:      0.7,
          opacity:     0.8,
        };
      },
      onEachFeature(feature, layer) {
        const p = feature.properties ?? {};
        // Tooltip on hover
        layer.bindTooltip(
          `<strong>${p.name ?? '—'}</strong><br>` +
          `<span style="color:#fd8d3c">Loss: ${formatHa(p.forestLossHa ?? 0)}</span><br>` +
          `Province: ${p.province ?? '—'}`,
          { sticky: true, direction: 'top', className: 'map-tooltip' }
        );
        layer.on({
          click(e) {
            L.popup({ maxWidth: 300, className: 'map-popup-wrapper' })
              .setLatLng(e.latlng)
              .setContent(buildDistrictPopup(p))
              .openOn(map);
            EventBus.emit('map:districtClick', { properties: p });
          },
        });
      },
    });
  }

  // ── 2. District Boundaries layer ────────────────────────────
  //    Transparent fill, subtle green-grey outline.
  //    Matches QGIS gadm41_NPL_3 base administrative layer.
  let districtBoundaryLayer = L.geoJSON();
  if (districtGeo?.features) {
    districtBoundaryLayer = L.geoJSON(districtGeo, {
      style: () => ({ ...DISTRICT_BASE_STYLE }),
      onEachFeature(feature, layer) {
        const p = feature.properties ?? {};
        layer.bindTooltip(
          `<strong>${p.name ?? '—'}</strong><br>Province: ${p.province ?? '—'}`,
          { sticky: true, direction: 'top', className: 'map-tooltip' }
        );
        layer.on({
          mouseover(e) { e.target.setStyle(DISTRICT_HOVER_STYLE); e.target.bringToFront(); },
          mouseout(e)  { districtBoundaryLayer.resetStyle(e.target); },
          click(e) {
            L.popup({ maxWidth: 300, className: 'map-popup-wrapper' })
              .setLatLng(e.latlng)
              .setContent(buildDistrictPopup(p))
              .openOn(map);
            EventBus.emit('map:districtClick', { properties: p });
          },
        });
      },
    });
    adminGeoJsonLayer = districtBoundaryLayer;
  }

  // ── 3. Province Boundaries layer ───────────────────────────
  //    Matches QGIS gadm41_NPL_2 styling: bold dark-red stroke,
  //    no fill (transparent) so it overlays without obscuring data.
  let provinceBoundaryLayer = L.geoJSON();
  if (provinceGeo?.features) {
    provinceBoundaryLayer = L.geoJSON(provinceGeo, {
      style: () => ({ ...PROVINCE_STYLE }),
      onEachFeature(feature, layer) {
        const name = feature.properties?.name ?? '—';
        layer.bindTooltip(
          `<strong>${name} Province</strong>`,
          { sticky: false, direction: 'center', className: 'map-tooltip map-tooltip--province' }
        );
      },
    });
  }

  // ── 4. Province Filled layer ────────────────────────────────
  //    Coloured fills per province (Set3 palette from QGIS).
  let provinceFilledLayer = L.geoJSON();
  if (provinceGeo?.features) {
    provinceFilledLayer = L.geoJSON(provinceGeo, {
      style(feature) {
        const name  = feature.properties?.name ?? '';
        const color = PROVINCE_COLORS[name] ?? '#cccccc';
        return {
          fillColor:   color,
          fillOpacity: 0.35,
          color:       '#c43c39',
          weight:      2.2,
          opacity:     0.95,
        };
      },
      onEachFeature(feature, layer) {
        const name = feature.properties?.name ?? '—';
        layer.bindTooltip(
          `<strong>${name} Province</strong>`,
          { sticky: false, direction: 'center', className: 'map-tooltip map-tooltip--province' }
        );
      },
    });
  }

  // ── 5. Risk Heat Map choropleth ─────────────────────────────
  let riskLayer = L.geoJSON();
  if (risk?.districts && districtGeo?.features) {
    const riskLookup = {};
    for (const d of risk.districts) riskLookup[d.name] = d.riskScore;

    riskLayer = L.geoJSON(districtGeo, {
      style(feature) {
        const score = riskLookup[feature.properties?.name] ?? 0;
        return {
          fillColor:   getRiskColor(score),
          fillOpacity: 0.68,
          color:       '#374151',
          weight:      0.8,
          opacity:     0.8,
        };
      },
      onEachFeature(feature, layer) {
        const p     = feature.properties ?? {};
        const score = riskLookup[p.name] ?? 0;
        layer.bindTooltip(
          `<strong>${p.name ?? '—'}</strong><br>` +
          `Risk Score: <b>${score}</b> — ${getRiskLevel(score)}`,
          { sticky: true, direction: 'top', className: 'map-tooltip' }
        );
        layer.on({
          click(e) {
            L.popup({ maxWidth: 300, className: 'map-popup-wrapper' })
              .setLatLng(e.latlng)
              .setContent(buildDistrictPopup(p))
              .openOn(map);
          },
        });
      },
    });
  }

  // ── Default visible layers ──────────────────────────────────
  // Show forest loss choropleth + province boundaries by default,
  // matching the QGIS project's checked-on layers.
  forestLossLayer.addTo(map);
  provinceBoundaryLayer.addTo(map);

  // ── Layer switcher ──────────────────────────────────────────
  const overlayLayers = {
    '<span class="layer-label layer-label--loss">Forest Loss (YlOrRd)</span>':       forestLossLayer,
    '<span class="layer-label layer-label--district">District Boundaries</span>':     districtBoundaryLayer,
    '<span class="layer-label layer-label--province">Province Boundaries</span>':     provinceBoundaryLayer,
    '<span class="layer-label layer-label--province-fill">Province Fill</span>':      provinceFilledLayer,
    '<span class="layer-label layer-label--risk">Risk Heat Map</span>':               riskLayer,
  };

  L.control.layers(baseLayers, overlayLayers, {
    position:       'topright',
    collapsed:      true,   // collapsed by default — click the ☰ icon to expand
    hideSingleBase: false,
  }).addTo(map);

  // Show risk legend section when risk layer is toggled
  map.on('overlayadd', (e) => {
    if (e.layer === riskLayer) {
      const riskSec = document.getElementById('map-legend-risk-section');
      if (riskSec) riskSec.style.display = '';
    }
  });
  map.on('overlayremove', (e) => {
    if (e.layer === riskLayer) {
      const riskSec = document.getElementById('map-legend-risk-section');
      if (riskSec) riskSec.style.display = 'none';
    }
  });

  // ── Scale bar (bottom-right, away from legend which is bottom-left) ──
  L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);

  // ── Custom controls ─────────────────────────────────────────
  new CustomZoomControl().addTo(map);
  new FullscreenControl().addTo(map);
  new ResetViewControl().addTo(map);
  new DistrictSearchControl().addTo(map);
  new MapLegendControl().addTo(map);

  // ── EventBus: year filter synced from dashboard.js ──────────
  EventBus.on('year:changed', ({ year }) => filterLayersByYear(year));
}

/**
 * Filter forest layers by year (called by EventBus 'year:changed').
 * For the choropleth approach, we re-style the loss layer to show
 * data relevant to the selected year if forestGeoData has per-year entries.
 *
 * @param {number} year
 */
export function filterLayersByYear(year) {
  // The YlOrRd choropleth uses the aggregate forestLossHa per district.
  // Year filtering is informational — we emit the event but do not
  // rebuild the layer to avoid performance issues with large GeoJSON.
  // A future enhancement could rebuild per-year statistics from forestGeoData.
  if (!map) return;
  // No-op for now — choropleth shows aggregate data, which is the authoritative view.
}
