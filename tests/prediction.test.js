// Feature: deforestation-watch-nepal
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { vi } from 'vitest';

vi.mock('../js/main.js', () => ({
  EventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}));

import { renderPredictionCard } from '../js/prediction.js';

describe('prediction', () => {
  // Property 7: Prediction Card Critical Badge Invariant
  // Validates: Requirements 9.3
  it('Property 7: card-critical class present iff riskScore >= 80', () => {
    // Feature: deforestation-watch-nepal, Property 7
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string(),
          riskScore: fc.integer({ min: 0, max: 100 })
        }),
        (district) => {
          const card = renderPredictionCard(district);
          const isCritical = card.classList.contains('card-critical');
          if (district.riskScore >= 80) {
            expect(isCritical).toBe(true);
          } else {
            expect(isCritical).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
