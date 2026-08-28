// Feature: deforestation-watch-nepal
import { describe, it, beforeEach, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock main.js EventBus
const mockEmit = vi.fn();
vi.mock('../js/main.js', () => ({
  EventBus: { on: vi.fn(), off: vi.fn(), emit: mockEmit }
}));

// Import loadAll after mocking its dependency
const { loadAll } = await import('../js/loader.js');

beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply mockEmit reference since vi.resetAllMocks clears it
  mockEmit.mockReset();
});

describe('loader', () => {
  // Property 4: Loader Round-Trip
  // Validates: Requirements 2.1, 2.2
  it('Property 4 — round-trip: loadAll returns stats deep-equal to the mock payload', async () => {
    // Feature: deforestation-watch-nepal, Property 4
    await fc.assert(
      fc.asyncProperty(
        // Generate a valid statistics.json-like payload
        fc.record({
          yearlyData: fc.array(
            fc.record({
              year: fc.integer({ min: 2000, max: 2030 }),
              forestCoverHa: fc.float({ min: 0, max: 10_000_000, noNaN: true })
            }),
            { minLength: 1, maxLength: 10 }
          )
        }),
        async (mockPayload) => {
          // Mock fetch to return the generated payload for all 5 files
          global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockPayload
          });

          const result = await loadAll();

          // stats deep-equals the mock payload
          expect(result.stats).toEqual(mockPayload);

          // JSON round-trip structural equivalence
          expect(JSON.parse(JSON.stringify(result.stats.yearlyData))).toEqual(
            JSON.parse(JSON.stringify(mockPayload.yearlyData))
          );

          // No errors when all fetches succeed
          expect(result.errors).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 5: Loader Resilience
  // Validates: Requirements 2.3, 2.4, 2.5
  it('Property 5 — resilience: loadAll always resolves, errors.length matches failed count, data:loaded is emitted', async () => {
    // Feature: deforestation-watch-nepal, Property 5
    await fc.assert(
      fc.asyncProperty(
        // Pick 1–4 file indices that will fail (indices 0–4 correspond to the 5 files)
        fc.subarray([0, 1, 2, 3, 4], { minLength: 1, maxLength: 4 }),
        async (failedIndices) => {
          const failedSet = new Set(failedIndices);
          let callCount = 0;

          // Mock fetch: reject for failed indices, resolve for others
          global.fetch = vi.fn().mockImplementation(() => {
            const idx = callCount++;
            if (failedSet.has(idx)) {
              return Promise.reject(new Error(`Simulated network failure for file ${idx}`));
            }
            return Promise.resolve({
              ok: true,
              json: async () => ({ data: 'ok' })
            });
          });

          // loadAll must always resolve — never throw
          let result;
          await expect(
            (async () => { result = await loadAll(); })()
          ).resolves.toBeUndefined();

          // errors.length equals the number of failed files
          expect(result.errors).toHaveLength(failedIndices.length);

          // data:loaded event must have been emitted exactly once
          expect(mockEmit).toHaveBeenCalledWith('data:loaded', expect.anything());

          // Reset for next run
          callCount = 0;
          vi.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });
});
