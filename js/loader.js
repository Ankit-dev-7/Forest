/**
 * js/loader.js — Data_Loader module
 * Fetches all 5 data files in parallel using Promise.allSettled.
 * Never rejects — surfaces per-file errors via EventBus.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 20.3
 */

import { EventBus } from './eventbus.js';

/** File paths and their identity labels */
const FILES = [
  { path: 'data/statistics.json',  label: 'statistics.json'  },
  { path: 'data/prediction.json',  label: 'prediction.json'  },
  { path: 'data/risk_score.json',  label: 'risk_score.json'  },
  { path: 'data/district.geojson', label: 'district.geojson' },
  { path: 'data/forest.geojson',   label: 'forest.geojson'   },
];

/**
 * Load all 5 data files in parallel.
 * Always resolves — partial failures are reported via EventBus 'data:error'.
 *
 * @returns {Promise<{
 *   stats:       object|null,
 *   prediction:  object|null,
 *   risk:        object|null,
 *   districtGeo: object|null,
 *   forestGeo:   object|null,
 *   errors:      Array<{file: string, error: Error}>
 * }>}
 */
export async function loadAll() {
  const errors = [];

  // Initiate all fetches in parallel
  const results = await Promise.allSettled(
    FILES.map(({ path }) => fetch(path))
  );

  // Parse each fulfilled response; treat parse failures as rejections
  const parsed = await Promise.allSettled(
    results.map((result, i) => {
      if (result.status === 'fulfilled') {
        const res = result.value;
        if (!res.ok) {
          return Promise.reject(
            new Error(`HTTP ${res.status} ${res.statusText}`)
          );
        }
        return res.json().catch(err => {
          throw new Error(`JSON parse error: ${err.message}`);
        });
      }
      // fetch itself rejected
      return Promise.reject(result.reason);
    })
  );

  // Collect results and errors
  const [stats, prediction, risk, districtGeo, forestGeo] = parsed.map(
    (result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      errors.push({ file: FILES[i].label, error: result.reason });
      return null;
    }
  );

  const payload = { stats, prediction, risk, districtGeo, forestGeo, errors };

  // Emit loaded event (consumers bootstrap from here)
  EventBus.emit('data:loaded', payload);

  // Emit individual error events so ui.js can display toasts
  for (const { file, error } of errors) {
    EventBus.emit('data:error', { file, error });
  }

  return payload;
}
