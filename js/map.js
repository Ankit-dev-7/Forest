/**
 * js/map.js — GIS_Map module
 * All Leaflet map initialisation, layer management, controls, and interaction events.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13
 *
 * NOTE: Leaflet (L) is a CDN global — not imported.
 * This file is extended by tasks 7.2 and 7.3.
 */

import { EventBus } from './eventbus.js';
import { getRiskColor, getRiskLevel, formatHa, formatNumber } from './utils.js';

// ============================================================
// Module-level state (shared across tasks 7.1, 7.2, 7.3)
// ============================================================

/** @type {L.Map|null} */
let map = null;

/** @type {object|null} Parsed district GeoJSON FeatureCollection */
let districtGeoData = null;

/** @type {object|null} Parsed forest GeoJSON FeatureCollection */
let forestGeoData = null;

/** @type {object|null} Parsed risk score data */
let riskData = null;

/** @type {L.LayerGroup|null} */
let Forest_Layer = null;

/** @type {L.LayerGroup|null} */
let Loss_Layer = null;

/** @type {L.LayerGroup|null} */
let Gain_Layer = null;

/** @type {L.GeoJSON|null} */
let Protected_Areas_Layer = null;

/** @type {L.GeoJSON|null} */
let Admin_Boundaries_Layer = null;

/** @type {L.GeoJSON|null} */
let riskLayer = null;

/** @type {L.GeoJSON|null} */
let adminGeoJsonLayer = null;

// Nepal geographic center and default zoom
const NEPAL_CENTER = [28.3949, 84.1240];
const DEFAULT_ZOOM = 7;

// ============================================================
// Helpers — style factories
// ============================================================

/**
 * Return a Leaflet style object for a forest feature.
 * @param {string} type  'cover' | 'loss' | 'gain'
 * @returns {object}
 */
function forestStyle(type) {
  const styles = {
    cover: { fillColor: '#22c55e', color: '#16a34a', weight: 1, fillOpacity: 0.4, opacity: 0.7 },
    loss:  { fillColor: '#ef4444', color: '#dc2626', weight: 1, fillOpacity: 0.4, opacity: 0.7 },
    gain:  { fillColor: '#3b82f6', color: '#2563eb', weight: 1, fillOpacity: 0.4, opacity: 0.7 },
  };
  return styles[type] || styles.cover;
}

/** Default style for admin boundary polygons */
const ADMIN_STYLE = {
  color: '#6b7280',
  weight: 1,
  fillOpacity: 0,
  opacity: 0.6,
};

/** Hover style for admin boundary polygons */
const ADMIN_HOVER_STYLE = {
  color: '#0ea5e9',
  weight: 3,
};

/** Style for protected areas (yellow stroke, no fill) */
const PROTECTED_STYLE = {
  color: '#f59e0b',
  weight: 2,
  fillOpacity: 0,
  opacity: 0.85,
  dashArray: '4 3',
};

// ============================================================
// Layer builders
// ============================================================

/**
 * Build a LayerGroup of GeoJSON features filtered by forest type.
 * @param {object[]} features  GeoJSON features array
 * @param {string}   type      'cover' | 'loss' | 'gain'
 * @returns {L.LayerGroup}
 */
function buildForestLayerGroup(features, type) {
  const group = L.layerGroup();
  const filtered = features.filter(
    f => f.properties && f.properties.type === type
  );
  if (filtered.length) {
    L.geoJSON(
      { type: 'FeatureCollection', features: filtered },
      { style: () => forestStyle(type) }
    ).addTo(group);
  }
  return group;
}

/**
 * Build the Admin_Boundaries_Layer from districtGeo.
 * Also stores the raw L.GeoJSON instance in adminGeoJsonLayer for
 * hover/click interactions added in task 7.2.
 * @param {object} districtGeo
 * @returns {L.GeoJSON}
 */
function buildAdminLayer(districtGeo) {
  const layer = L.geoJSON(districtGeo, {
    style: () => ({ ...ADMIN_STYLE }),
    onEachFeature(feature, featureLayer) {
      // Hover interactions (wired fully in task 7.2 but stubs are here)
      featureLayer.on({
        mouseover(e) {
          e.target.setStyle(ADMIN_HOVER_STYLE);
          e.target.bringToFront();
        },
        mouseout(e) {
          layer.resetStyle(e.target);
        },
        click(e) {
          const p = feature.properties || {};
          const riskScore = p.riskScore ?? 0;
          const riskLevel = getRiskLevel(riskScore);
          const trend = p.trend != null ? `${Number(p.trend).toFixed(2)}%` : 'N/A';

          // Build popup content with textContent-safe table
          const container = document.createElement('div');
          container.className = 'map-popup';

          const table = document.createElement('table');
          table.setAttribute('role', 'presentation');

          const rows = [
            ['District',     p.name          ?? 'Unknown'],
            ['Forest Cover', formatHa(p.forestCoverHa ?? 0)],
            ['Forest Loss',  formatHa(p.forestLossHa  ?? 0)],
            ['Forest Gain',  formatHa(p.forestGainHa  ?? 0)],
            ['Risk Score',   formatNumber(riskScore)],
            ['Risk Level',   riskLevel],
            ['Trend',        trend],
          ];

          rows.forEach(([label, value]) => {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            const td = document.createElement('td');
            th.textContent = label;
            td.textContent = value;
            tr.appendChild(th);
            tr.appendChild(td);
            table.appendChild(tr);
          });

          container.appendChild(table);

          L.popup({ maxWidth: 280 })
            .setLatLng(e.latlng)
            .setContent(container)
            .openOn(map);

          EventBus.emit('map:districtClick', { properties: p });
        },
      });
    },
  });

  adminGeoJsonLayer = layer;
  return layer;
}

/**
 * Build the Protected_Areas_Layer.
 * For the current data model, districtGeo is also used as the source
 * (all districts count as administrative / protected boundary polygons).
 * Replace the filter predicate if a separate "protected" flag is added later.
 * @param {object} districtGeo
 * @returns {L.GeoJSON}
 */
function buildProtectedLayer(districtGeo) {
  // Filter to features that have a riskScore above threshold or province tag —
  // for the initial data model we use all features but apply the protected style.
  return L.geoJSON(districtGeo, {
    style: () => ({ ...PROTECTED_STYLE }),
  });
}

// ============================================================
// Custom Controls — Task 7.2
// ============================================================

/**
 * Fullscreen control — toggles .map-fullscreen on #map-container.
 * Positions at 'topleft'.
 */
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

      // Notify Leaflet of size change
      setTimeout(() => mapInstance.invalidateSize(), 100);
    };

    L.DomEvent.on(btn, 'click', toggle);
    L.DomEvent.on(btn, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') toggle(e);
    });

    // Escape key closes fullscreen
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFullscreen) toggle(e);
    });

    return container;
  },
});

/**
 * Reset View control — returns map to Nepal center/zoom.
 * Positions at 'topleft'.
 */
const ResetViewControl = L.Control.extend({
  options: { position: 'topleft' },

  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-reset-control');

    const btn = L.DomUtil.create('a', 'custom-reset-btn', container);
    btn.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>';
    btn.title = 'Reset map view';
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
    L.DomEvent.on(btn, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') reset(e);
    });

    return container;
  },
});

/**
 * District Search control — autocomplete by district name.
 * Positions at 'topleft'.
 */
const DistrictSearchControl = L.Control.extend({
  options: { position: 'topleft' },

  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-control district-search-control');
    container.setAttribute('role', 'search');
    container.setAttribute('aria-label', 'District search');

    // Input
    const input = L.DomUtil.create('input', 'district-search-input', container);
    input.type = 'text';
    input.placeholder = 'Search district…';
    input.setAttribute('aria-label', 'Search for a district');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('autocomplete', 'off');

    // Suggestions list
    const list = L.DomUtil.create('ul', 'district-search-list', container);
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'District suggestions');
    list.style.display = 'none';

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    /** @param {string} query */
    const updateSuggestions = (query) => {
      list.innerHTML = '';
      if (!query || !districtGeoData) {
        list.style.display = 'none';
        return;
      }
      const q = query.toLowerCase();
      const matches = districtGeoData.features
        .filter(f => f.properties && f.properties.name &&
                     f.properties.name.toLowerCase().includes(q))
        .slice(0, 8);

      if (!matches.length) {
        list.style.display = 'none';
        return;
      }

      matches.forEach(feature => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = feature.properties.name;
        li.style.cssText = 'padding:0.4rem 0.75rem;cursor:pointer;font-size:0.8rem;';

        li.addEventListener('mouseenter', () => { li.style.background = '#f1f5f9'; });
        li.addEventListener('mouseleave', () => { li.style.background = ''; });

        li.addEventListener('click', () => {
          input.value = feature.properties.name;
          list.style.display = 'none';
          selectDistrict(feature);
        });

        list.appendChild(li);
      });

      list.style.display = 'block';
    };

    /** Zoom to and highlight a district feature */
    const selectDistrict = (feature) => {
      if (!adminGeoJsonLayer) return;
      let targetLayer = null;
      adminGeoJsonLayer.eachLayer(layer => {
        if (layer.feature &&
            layer.feature.properties &&
            layer.feature.properties.name === feature.properties.name) {
          targetLayer = layer;
        }
      });
      if (targetLayer) {
        mapInstance.fitBounds(targetLayer.getBounds(), { padding: [20, 20] });
        targetLayer.setStyle({ color: '#0ea5e9', weight: 3, fillOpacity: 0.2 });
        setTimeout(() => {
          adminGeoJsonLayer.resetStyle(targetLayer);
        }, 2000);
      }
    };

    input.addEventListener('input', (e) => {
      updateSuggestions(e.target.value.trim());
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        list.style.display = 'none';
        input.value = '';
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        list.style.display = 'none';
      }
    });

    return container;
  },
});

/**
 * Custom zoom control (replaces the disabled default).
 * Positions at 'topleft'.
 */
const CustomZoomControl = L.Control.extend({
  options: { position: 'topleft' },

  onAdd(mapInstance) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-zoom-control');

    // Zoom-in button
    const zoomIn = L.DomUtil.create('a', 'custom-zoom-in', container);
    zoomIn.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    zoomIn.title = 'Zoom in';
    zoomIn.setAttribute('role', 'button');
    zoomIn.setAttribute('aria-label', 'Zoom in');
    zoomIn.setAttribute('tabindex', '0');
    zoomIn.href = '#';

    // Zoom-out button
    const zoomOut = L.DomUtil.create('a', 'custom-zoom-out', container);
    zoomOut.innerHTML = '<i class="fa-solid fa-minus" aria-hidden="true"></i>';
    zoomOut.title = 'Zoom out';
    zoomOut.setAttribute('role', 'button');
    zoomOut.setAttribute('aria-label', 'Zoom out');
    zoomOut.setAttribute('tabindex', '0');
    zoomOut.href = '#';

    // Prevent map drag on control click
    L.DomEvent.disableClickPropagation(container);

    function handleZoomIn(e) {
      L.DomEvent.preventDefault(e);
      mapInstance.zoomIn();
    }
    function handleZoomOut(e) {
      L.DomEvent.preventDefault(e);
      mapInstance.zoomOut();
    }

    L.DomEvent.on(zoomIn,  'click',   handleZoomIn);
    L.DomEvent.on(zoomOut, 'click',   handleZoomOut);

    // Keyboard support
    L.DomEvent.on(zoomIn, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleZoomIn(e);
    });
    L.DomEvent.on(zoomOut, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleZoomOut(e);
    });

    return container;
  },
});

/**
 * Map legend control — shows color codes for active overlays.
 * Positions at 'bottomright'.
 */
const MapLegendControl = L.Control.extend({
  options: { position: 'bottomright' },

  onAdd() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.setAttribute('aria-label', 'Map legend');
    div.setAttribute('role', 'complementary');

    div.innerHTML = `
      <h4 class="map-legend__title">Legend</h4>
      <ul class="map-legend__list" role="list">
        <li class="map-legend__item">
          <span class="map-legend__swatch" style="background:#22c55e;" aria-hidden="true"></span>
          <span>Forest Cover</span>
        </li>
        <li class="map-legend__item">
          <span class="map-legend__swatch" style="background:#ef4444;" aria-hidden="true"></span>
          <span>Forest Loss</span>
        </li>
        <li class="map-legend__item">
          <span class="map-legend__swatch" style="background:#3b82f6;" aria-hidden="true"></span>
          <span>Forest Gain</span>
        </li>
        <li class="map-legend__item">
          <span class="map-legend__swatch map-legend__swatch--border"
                style="border:2px solid #f59e0b;" aria-hidden="true"></span>
          <span>Protected Areas</span>
        </li>
        <li class="map-legend__item">
          <span class="map-legend__swatch map-legend__swatch--border"
                style="border:1px solid #6b7280;" aria-hidden="true"></span>
          <span>Admin Boundaries</span>
        </li>
      </ul>
    `;

    // Prevent map interactions propagating through the legend
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    return div;
  },
});

// ============================================================
// Public API
// ============================================================

/**
 * Initialise the Leaflet map.
 * Called once by main.js after data:loaded.
 *
 * @param {object|null} districtGeo  GeoJSON FeatureCollection for districts
 * @param {object|null} forestGeo    GeoJSON FeatureCollection for forest types
 * @param {object|null} risk         risk_score.json parsed object
 */
export function init(districtGeo, forestGeo, risk) {
  // Store module-level references for tasks 7.2 and 7.3
  districtGeoData = districtGeo;
  forestGeoData   = forestGeo;
  riskData        = risk;

  // ── Create map ────────────────────────────────────────────
  map = L.map('map-container', {
    zoomControl: false,   // replaced by CustomZoomControl below
    center: NEPAL_CENTER,
    zoom: DEFAULT_ZOOM,
  });

  // ── Base tile layers ──────────────────────────────────────
  const osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }
  ).addTo(map);   // OpenStreetMap is the default base layer

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }
  );

  const baseLayers = {
    'OpenStreetMap': osmLayer,
    'Satellite':     satelliteLayer,
  };

  // ── Forest overlay layers ─────────────────────────────────
  if (forestGeo && Array.isArray(forestGeo.features)) {
    Forest_Layer = buildForestLayerGroup(forestGeo.features, 'cover');
    Loss_Layer   = buildForestLayerGroup(forestGeo.features, 'loss');
    Gain_Layer   = buildForestLayerGroup(forestGeo.features, 'gain');
  } else {
    if (!forestGeo) {
      console.warn('[map.js] forestGeo is null — forest overlays will be empty.');
    }
    Forest_Layer = L.layerGroup();
    Loss_Layer   = L.layerGroup();
    Gain_Layer   = L.layerGroup();
  }

  // ── District / protected layers ───────────────────────────
  if (districtGeo && Array.isArray(districtGeo.features)) {
    Protected_Areas_Layer  = buildProtectedLayer(districtGeo);
    Admin_Boundaries_Layer = buildAdminLayer(districtGeo);
  } else {
    if (!districtGeo) {
      console.warn('[map.js] districtGeo is null — district layers will be empty.');
    }
    Protected_Areas_Layer  = L.geoJSON();
    Admin_Boundaries_Layer = L.geoJSON();
    adminGeoJsonLayer      = Admin_Boundaries_Layer;
  }

  // Add Admin Boundaries by default so the map isn't blank
  Admin_Boundaries_Layer.addTo(map);

  const overlayLayers = {
    'Forest Cover':      Forest_Layer,
    'Forest Loss':       Loss_Layer,
    'Forest Gain':       Gain_Layer,
    'Protected Areas':   Protected_Areas_Layer,
    'Admin Boundaries':  Admin_Boundaries_Layer,
  };

  // ── Risk Heat Map choropleth layer (task 7.3) ─────────────
  if (risk && risk.districts && districtGeo && Array.isArray(districtGeo.features)) {
    // Build a lookup: district name → riskScore
    const riskLookup = {};
    for (const d of risk.districts) {
      riskLookup[d.name] = d.riskScore;
    }

    riskLayer = L.geoJSON(districtGeo, {
      style(feature) {
        const score = riskLookup[feature.properties?.name] ?? 0;
        return {
          fillColor:   getRiskColor(score),
          color:       '#374151',
          weight:      1,
          fillOpacity: 0.65,
          opacity:     0.8,
        };
      },
      onEachFeature(feature, featureLayer) {
        const p = feature.properties || {};
        const score = riskLookup[p.name] ?? 0;
        featureLayer.bindTooltip(
          `<strong>${p.name ?? 'Unknown'}</strong><br>Risk Score: ${score}<br>Level: ${getRiskLevel(score)}`,
          { sticky: true, direction: 'top' }
        );
      },
    });

    // Add to overlay switcher (off by default)
    overlayLayers['Risk Heat Map'] = riskLayer;
  }

  // ── Layer switcher control (top-right) ────────────────────
  L.control.layers(baseLayers, overlayLayers, { position: 'topright' }).addTo(map);

  // ── Scale bar (bottom-left) ───────────────────────────────
  L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

  // ── Custom zoom control (top-left) ────────────────────────
  new CustomZoomControl().addTo(map);

  // ── Fullscreen, Reset, Search controls (task 7.2) ────────
  new FullscreenControl().addTo(map);
  new ResetViewControl().addTo(map);
  new DistrictSearchControl().addTo(map);

  // ── Map legend (bottom-right) ─────────────────────────────
  new MapLegendControl().addTo(map);

  // ── EventBus subscription for year:changed (task 7.3) ────
  EventBus.on('year:changed', ({ year }) => filterLayersByYear(year));
}

/**
 * Filter Forest_Layer, Loss_Layer, and Gain_Layer to the given year.
 * Called by EventBus 'year:changed' (wired in task 7.3).
 *
 * @param {number} year
 */
export function filterLayersByYear(year) {
  if (!forestGeoData || !Array.isArray(forestGeoData.features)) {
    console.warn('[map.js] filterLayersByYear called but forestGeoData is unavailable.');
    return;
  }
  if (!map) return;

  // Clear existing feature layers from each group
  Forest_Layer.clearLayers();
  Loss_Layer.clearLayers();
  Gain_Layer.clearLayers();

  const yearFeatures = forestGeoData.features.filter(
    f => f.properties && f.properties.year === year
  );

  const byType = { cover: [], loss: [], gain: [] };
  for (const f of yearFeatures) {
    const t = f.properties.type;
    if (byType[t]) byType[t].push(f);
  }

  const addToGroup = (group, features, type) => {
    if (features.length) {
      L.geoJSON(
        { type: 'FeatureCollection', features },
        { style: () => forestStyle(type) }
      ).addTo(group);
    }
  };

  addToGroup(Forest_Layer, byType.cover, 'cover');
  addToGroup(Loss_Layer,   byType.loss,  'loss');
  addToGroup(Gain_Layer,   byType.gain,  'gain');
}
