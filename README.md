# Deforestation Watch Nepal

A fully static, single-page GIS intelligence dashboard for monitoring Nepal's deforestation data. It visualises forest cover trends, district-level risk scores, AI-driven predictions, and annual change data across all 77 districts — no server or build step required.

---

## Quick Start

Open `index.html` in any modern browser — no build step required.

> The dashboard uses ES6 modules, so you may need to serve the files over HTTP in some browsers (e.g. `npx serve .` or VS Code Live Server) rather than opening the file directly via `file://`.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Markup / Layout | HTML5, CSS3 |
| Logic | Vanilla JavaScript (ES6 Modules) |
| Styling utility | TailwindCSS (CDN) |
| Interactive map | Leaflet.js v1.9.4 (CDN) |
| Charts | Chart.js (CDN) |
| Icons | Font Awesome v6.5.0 (CDN) |
| Typography | Google Fonts — Inter |
| Testing | Vitest + fast-check (property-based) |

---

## CDN Dependencies

```html
<!-- TailwindCSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Leaflet.js v1.9.4 -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- Font Awesome v6.5.0 -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />

<!-- Google Fonts — Inter -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

---

## Project Structure

```
.
├── index.html              # Entry point — open this in a browser
├── package.json            # Dev dependencies (Vitest, fast-check)
├── vitest.config.js        # Test runner configuration
│
├── css/
│   ├── style.css           # Core styles
│   ├── animations.css      # Transition & animation definitions
│   └── responsive.css      # Breakpoint / media-query overrides
│
├── js/
│   ├── main.js             # Application entry point; hosts the EventBus
│   ├── loader.js           # Async data fetching for all data files
│   ├── map.js              # Leaflet map initialisation and layer management
│   ├── charts.js           # Chart.js chart instances (trend, comparison, etc.)
│   ├── prediction.js       # AI prediction dashboard rendering
│   ├── dashboard.js        # Time explorer / year-filter logic
│   ├── ui.js               # Shared UI components (tooltips, modals, sidebar)
│   └── utils.js            # Pure utility functions (formatting, colour scales)
│
├── data/                   # Static data files (see Data Files section below)
│   ├── statistics.json
│   ├── prediction.json
│   ├── risk_score.json
│   ├── district.geojson
│   └── forest.geojson
│
└── tests/                  # Vitest test suite
    ├── utils.test.js
    ├── loader.test.js
    ├── prediction.test.js
    ├── ui.test.js
    ├── search.test.js
    ├── yearFilter.test.js
    └── integration.test.js
```

---

## Data Files

### `data/statistics.json`
Aggregated forest statistics used by the main charts and summary cards.

| Key | Type | Description |
|---|---|---|
| `yearlyData` | Array | Annual national forest-cover figures |
| `provinces` | Array | Province-level summary statistics |
| `districts` | Array | District-level summary statistics |
| `composition` | Object | Forest type composition breakdown |

---

### `data/prediction.json`
AI-generated predictions for each district, powering the Prediction Dashboard panel.

| Key | Type | Description |
|---|---|---|
| `riskScore` | Number (0–100) | Overall deforestation risk score |
| `riskLevel` | String | Categorical label: `low`, `medium`, `high`, `critical` |
| `projectedCover` | Number | Projected forest-cover percentage for the target year |

One entry per district (77 total).

---

### `data/risk_score.json`
Simplified district risk scores used for map choropleth colouring and quick lookups.

| Key | Type | Description |
|---|---|---|
| `district` | String | District name |
| `score` | Number (0–100) | Risk score |

---

### `data/district.geojson`
GeoJSON `FeatureCollection` containing Nepal's 77 district boundaries, enriched with forest metrics in each feature's `properties` object.

Key properties per feature:

| Property | Type | Description |
|---|---|---|
| `DIST_EN` | String | District name (English) |
| `forestCover` | Number | Current forest-cover percentage |
| `forestLoss` | Number | Cumulative forest loss (ha) |
| `forestGain` | Number | Cumulative forest gain (ha) |
| `riskScore` | Number | Deforestation risk score (0–100) |

Used by `js/map.js` to render district boundaries and choropleth layers.

---

### `data/forest.geojson`
GeoJSON `FeatureCollection` with forest cover, loss, and gain layers broken down by year.

| Property | Type | Description |
|---|---|---|
| `year` | Number | Data year |
| `type` | String | Layer type: `cover`, `loss`, or `gain` |
| `area_ha` | Number | Area in hectares |

Used by `js/map.js` and `js/dashboard.js` to drive the time-explorer animation.

---

## Running Tests

The test suite uses **Vitest** as the runner and **fast-check** for property-based tests.

```bash
# Install dev dependencies (first time only)
npm install

# Run the full test suite once
npx vitest --run

# Run tests in watch mode during development
npx vitest
```

Test files live in the `tests/` directory and follow the `*.test.js` naming convention.
