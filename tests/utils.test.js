// Feature: deforestation-watch-nepal
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getRiskLevel, getRiskColor, clamp, formatNumber, formatHa } from '../js/utils.js';

// ---------------------------------------------------------------------------
// Example-based tests
// ---------------------------------------------------------------------------
describe('formatNumber — examples', () => {
  it('formats 1234567 with comma separators', () => {
    const result = formatNumber(1234567);
    // toLocaleString output is locale-dependent; assert it contains only digits and commas
    expect(result).toMatch(/^[\d,]+$/);
    expect(result.replace(/,/g, '')).toBe('1234567');
  });

  it('formats 0 as "0"', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatHa — examples', () => {
  it('formats 450000 as "<number> ha"', () => {
    const result = formatHa(450000);
    expect(result).toMatch(/ ha$/);
    // The numeric part should contain only digits and commas
    const numPart = result.replace(' ha', '');
    expect(numPart).toMatch(/^[\d,]+$/);
    expect(numPart.replace(/,/g, '')).toBe('450000');
  });
});

// ---------------------------------------------------------------------------
// Property 1: Risk Level Derivation is Total and Correct
// Feature: deforestation-watch-nepal, Property 1
// ---------------------------------------------------------------------------
describe('getRiskLevel — property: total and correct', () => {
  it('returns the correct label for every integer in [0, 100]', () => {
    // Feature: deforestation-watch-nepal, Property 1
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
        const level = getRiskLevel(score);
        if (score >= 80) return level === 'Critical';
        if (score >= 60) return level === 'High';
        if (score >= 40) return level === 'Medium';
        return level === 'Low';
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Risk Color Coverage
// Feature: deforestation-watch-nepal, Property 2
// ---------------------------------------------------------------------------
describe('getRiskColor — property: always returns a valid hex color', () => {
  it('returns a string starting with # and length >= 4 for every score in [0, 100]', () => {
    // Feature: deforestation-watch-nepal, Property 2
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
        const color = getRiskColor(score);
        return typeof color === 'string' && color.startsWith('#') && color.length >= 4;
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Clamp Invariant
// Feature: deforestation-watch-nepal, Property 3
// ---------------------------------------------------------------------------
describe('clamp — property: result is always within [min, max]', () => {
  it('clamps any float value to [min, max]', () => {
    // Feature: deforestation-watch-nepal, Property 3
    fc.assert(
      fc.property(
        fc.float({ noNaN: true }),
        fc.float({ noNaN: true }),
        fc.float({ noNaN: true }),
        (a, b, value) => {
          // Normalize so min <= max
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const result = clamp(value, lo, hi);
          return result >= lo && result <= hi;
        }
      ),
      { numRuns: 100 }
    );
  });
});
