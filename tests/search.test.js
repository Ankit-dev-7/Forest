// Feature: deforestation-watch-nepal
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterDistrictNames } from '../js/utils.js';

describe('search', () => {
  it('Property 10: District Search Filter is Inclusive and Case-Insensitive', () => {
    // Feature: deforestation-watch-nepal, Property 10
    // Validates: Requirements 9.7
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 77 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (names, q) => {
          const result = filterDistrictNames(names, q);
          const expected = names.filter(n => n.toLowerCase().includes(q.toLowerCase()));

          // Result length must equal the expected filtered length
          expect(result.length).toBe(expected.length);

          // Every result must be in the expected set
          const expectedSet = new Set(expected);
          for (const name of result) {
            expect(expectedSet.has(name)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
