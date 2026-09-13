# 🌿 Deforestation Watch Nepal

A GIS-based environmental intelligence platform for monitoring Nepal's forest cover, forest loss, and deforestation risk across all 77 districts from 2015–2025.

![Project Banner](Photos/background%206.jpeg)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Live Features](#live-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Sources](#data-sources)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Team](#team)

---

## Overview

Deforestation Watch Nepal is a fully static, client-side web application that brings together satellite-derived forest data, GIS district boundaries, and risk modelling into a single interactive dashboard. There is no backend — all data lives in JSON/GeoJSON files and all processing happens in the browser.

The platform was built by a team of students under the **Coding for Social Good Nepal** initiative, combining GIS analysis, data visualisation, and frontend engineering to provide actionable environmental intelligence.

---

## Live Features

### 🗺️ Interactive GIS Map
- Leaflet-powered map centred on Nepal with OpenStreetMap and Esri Satellite base layers
- Toggleable overlays: Forest Cover, Forest Loss, Forest Gain, Protected Areas, Admin Boundaries, and a Risk Heat Map choropleth
- Click any district polygon for a popup showing forest cover, loss, gain, risk score, risk level, and trend
- District search with autocomplete — type a name to fly to and highlight it
- Custom controls: zoom, reset view, fullscreen (with Escape-key exit)
- Scale bar and colour-coded map legend
- Year-aware: overlays update when the analytics year filter changes

### 📊 Forest Change Analytics Dashboard
- **KPI cards** — Total Forest Cover, Forest Loss, Forest Gain, Net Forest Change with period deltas
- **Year range + Province + District filters** with instant chart updates
- **Forest Change Over Time** — multi-dataset line chart (cover, loss, gain) with toggleable legend
- **Annual Forest Loss** — bar chart with peak loss year insight strip
- **Forest Gain vs Forest Loss** — grouped bar chart with net change strip
- **Forest Change by Province** — interactive radial/SVG chart, switchable between Loss / Cover / Gain / Net metrics
- **Top 10 Districts by Forest Loss** — ranked list, switchable between Loss / Gain / Net
- **Forest Composition** — donut chart by forest type (% of total) with centre total
- **Key Findings** — auto-derived insights from the currently filtered data
- **Detailed Data Table** — sortable by any column, collapsible

### 📈 Statistics Cards
Prominent summary cards for national-level forest cover, annual loss, annual gain, and protected area counts, driven by `statistics.json`.

### 🔮 Deforestation Risk Insights
- Environmental Insights section with auto-generated insight cards
- Top-10 High Risk Districts ranked by Composite Risk Index (0–100), colour-coded by severity (Low / Medium / High / Critical), sourced from DFRS 2015 + FAO data

### 🤝 Team & Contact
- Team member profiles with role descriptions and GitHub/LinkedIn links
- Contact form powered by Web3Forms with client-side validation

### ✨ UX & Accessibility
- Aurora environmental glow theme with emerald–teal accent palette
- Smooth scroll-reveal animations for every section
- Particle canvas on the hero section
- Fully responsive layout (mobile hamburger menu, responsive charts and grids)
- ARIA labels, roles, live regions, and screen-reader-only data tables on every chart
- Keyboard navigation throughout (map controls, nav, forms, modals)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mapping | [Leaflet 1.9.4](https://leafletjs.com/) |
| Charts | [Chart.js 4.4.0](https://www.chartjs.org/) |
| Icons | [Font Awesome 6.5.0](https://fontawesome.com/) |
| Fonts | [Google Fonts — Inter](https://fonts.google.com/specimen/Inter) |
| Contact | [Web3Forms](https://web3forms.com/) |
| Dev server | [http-server](https://github.com/http-party/http-server) |
| Tests | [Vitest 4.1.10](https://vitest.dev/) + [jsdom](https://github.com/jsdom/jsdom) + [fast-check](https://fast-check.io/) |
| Language | Vanilla ES6 modules — zero build step, zero framework |

---

## Project Structure

```
deforestation-watch-nepal/
├── index.html              # Single-page app shell
│
├── css/
│   ├── style.css           # Base layout, components, and typography
│   ├── animations.css      # Scroll-reveal, hero particles, transitions
│   ├── responsive.css      # Mobile-first breakpoints
│   └── aurora-theme.css    # Emerald–teal aurora glow theme (loaded last)
│
├── js/
│   ├── main.js             # App entry point — bootstraps all modules
│   ├── eventbus.js         # Tiny pub/sub event bus
│   ├── loader.js           # Fetches all JSON/GeoJSON data files
│   ├── ui.js               # Stat cards, hero stats, navbar, contact form
│   ├── map.js              # Leaflet map, layers, controls, search
│   ├── analytics.js        # Analytics dashboard — charts, filters, KPIs
│   ├── charts.js           # Legacy chart helpers (year-highlight via EventBus)
│   ├── dashboard.js        # Year timeline / time explorer
│   ├── prediction.js       # Risk scores, Top-10 district list
│   └── utils.js            # Shared formatters and risk colour helpers
│
├── data/
│   ├── statistics.json     # National + yearly + province + district stats
│   ├── district.geojson    # Nepal district boundary polygons (77 districts)
│   ├── forest.geojson      # Forest cover/loss/gain polygons by year
│   ├── prediction.json     # District-level deforestation predictions
│   └── risk_score.json     # Composite risk scores per district (0–100)
│
├── Photos/
│   ├── Logo 3.png          # Project logo
│   ├── background 6.jpeg   # Hero background photograph
│   └── ...                 # Team member photos
│
├── tests/
│   ├── utils.test.js       # Unit tests for utility functions
│   ├── loader.test.js      # Tests for the data loader
│   ├── search.test.js      # Tests for district search logic
│   └── yearFilter.test.js  # Tests for year filtering logic
│
├── vitest.config.js        # Vitest configuration
└── package.json
```

---

## Data Sources

| Dataset | Source |
|---|---|
| Forest Cover Baseline | [DFRS (2015) State of Nepal Forests](http://www.dfrs.gov.np/) — 5,963,412 ha national baseline |
| Annual Forest Loss | [Global Forest Watch / UMD Landsat](https://www.globalforestwatch.org/) (Hansen et al., *Science* 2013, updated annually) |
| Forest Gain | Calibrated to Nepal [REDD+ Forest Reference Level](https://redd.unfccc.int/submissions/reference-levels.html) (UNFCCC 2017) |
| Province Breakdown | DFRS regional reports + Springer Gandaki study (2021) + MDPI Lumbini study (2021) |
| District Boundaries | DFRS Forest Cover Maps of Local Levels (2018) |
| Risk Index | Composite index derived from DFRS 2015 physiographic pressure data + FAO Nepal forestry data |

> **Note:** 2025 GFW loss figures are estimated (average of 2022–2024) as official GFW 2025 data had not been published at time of writing.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (any recent LTS)
- A modern browser (Chrome, Firefox, Edge, Safari)

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

> The app is fully static — you can also serve it with any other static file server or open `index.html` directly via a local server (CORS restrictions prevent opening it as a bare `file://` URL due to the JSON/GeoJSON fetches).

---

## Running Tests

```bash
npm test
```

This runs the Vitest suite once (`--run` flag, no watch mode). The test suite covers utility functions, the data loader, district search logic, and year-filtering behaviour.

To run in watch mode during development:

```bash
npm run test:watch
```

---

## Team

| Name | Role |
|---|---|
| **Ashish Pandey** | Mentor |
| **Binod Pandey** | Co-Mentor |
| **Abhiruchi Gautam** | Documentation Specialist |
| **Ankit Gaire** | Frontend Developer |
| **Bipul Pandey** | Data Visualizer |
| **Dipti Ojha** | Presentation Specialist |
| **Suyog Adhikari** | GIS Analyst |
| **Shishir Pandey** | Data Analyst |

---

## License

© 2025 Deforestation Watch Nepal — [Coding for Social Good Nepal](https://github.com/deforestation-watch-nepal). All rights reserved.
