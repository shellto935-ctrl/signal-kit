import { describe, it, expect } from 'vitest';
import { detectSwingPoints } from '../src/structure.js';
import type { Candle } from '../src/types.js';

function c(h: number, l: number, i: number): Candle {
  return { openTimeMs: i * 4 * 60 * 60 * 1000, open: (h + l) / 2, high: h, low: l, close: (h + l) / 2 };
}

describe('detectSwingPoints', () => {
  it('finds a clean swing high in the middle of a descending-then-ascending series', () => {
    const candles = [c(1.10, 1.09, 0), c(1.11, 1.10, 1), c(1.12, 1.11, 2), c(1.15, 1.13, 3), c(1.12, 1.11, 4), c(1.11, 1.10, 5), c(1.10, 1.09, 6)];
    const points = detectSwingPoints(candles, 3);
    const high = points.find((p) => p.kind === 'HIGH' && p.candleIndex === 3);
    expect(high?.price).toBe(1.15);
  });

  it('marks a swing point with no prior approaches as NOT engineered (touches = 1)', () => {
    const candles = [c(1.10, 1.09, 0), c(1.11, 1.10, 1), c(1.12, 1.11, 2), c(1.15, 1.13, 3), c(1.12, 1.11, 4), c(1.11, 1.10, 5), c(1.10, 1.09, 6)];
    const points = detectSwingPoints(candles, 3);
    const high = points.find((p) => p.kind === 'HIGH' && p.candleIndex === 3);
    expect(high?.touches).toBe(1);
    expect(high?.engineered).toBe(false);
  });

  it('marks a swing point as engineered once price has respected that level before', () => {
    // Candle 1's high (1.148) approaches the eventual 1.15 pivot at index 4
    // and is respected (closes well below it) — a prior touch, making the
    // final pivot "engineered" liquidity per the Da Vinci model.
    const candles = [c(1.10, 1.09, 0), c(1.148, 1.10, 1), c(1.11, 1.10, 2), c(1.12, 1.11, 3), c(1.15, 1.13, 4), c(1.12, 1.11, 5), c(1.11, 1.10, 6), c(1.10, 1.09, 7)];
    const points = detectSwingPoints(candles, 3);
    const high = points.find((p) => p.kind === 'HIGH' && p.candleIndex === 4);
    expect(high?.touches).toBe(2);
    expect(high?.engineered).toBe(true);
  });

  it('finds a clean swing low', () => {
    const candles = [c(1.15, 1.13, 0), c(1.13, 1.12, 1), c(1.12, 1.11, 2), c(1.10, 1.08, 3), c(1.12, 1.11, 4), c(1.13, 1.12, 5), c(1.15, 1.13, 6)];
    const points = detectSwingPoints(candles, 3);
    expect(points.some((p) => p.kind === 'LOW' && p.candleIndex === 3 && p.price === 1.08)).toBe(true);
  });

  it('does not flag a flat series as having any pivots', () => {
    const candles = Array.from({ length: 10 }, (_, i) => c(1.10, 1.09, i));
    expect(detectSwingPoints(candles, 3)).toHaveLength(0);
  });
});
