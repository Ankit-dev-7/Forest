// Feature: deforestation-watch-nepal
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock the EventBus import before importing dashboard
vi.mock('../js/main.js', () => ({
  EventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}));

import { getDefaultYear, filterByYearRange } from '../js/dashboard.js';

describe('yearFilter', () => {
  // Property 8: Year Filter Produces Bounded Results
  it('Property 8: filterByYearRange returns only entries within [start, end]', () => {
    // Feature: deforestation-watch-nepal, Property 8
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            year: fc.integer({ min: 2015, max: 2026 }),
            forestCoverHa: fc.float({ min: 0 }),
          })
        ),
        fc.integer({ min: 2015, max: 2026 }),
        fc.integer({ min: 2015, max: 2026 }),
        (data, a, b) => {
          const start = Math.min(a, b);
          const end = Math.max(a, b);
          const result = filterByYearRange(data, start, end);
          return result.every(entry => entry.year >= start && entry.year <= end);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 9: Time Explorer Defaults to Most Recent Year
  it('Property 9: getDefaultYear returns the maximum year in the dataset', () => {
    // Feature: deforestation-watch-nepal, Property 9
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ year: fc.integer({ min: 2015, max: 2026 }) }),
          { minLength: 1 }
        ),
        (data) => {
          const result = getDefaultYear(data);
          const expected = Math.max(...data.map(d => d.year));
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});
