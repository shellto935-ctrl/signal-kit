import { describe, it, expect } from 'vitest';
import { runLiquidityStrategy } from '../src/strategy.js';
import type { Candle } from '../src/types.js';

function h4(h: number, l: number, i: number): Candle {
  return { openTimeMs: i * 4 * 60 * 60 * 1000, open: (h + l) / 2, high: h, low: l, close: (h + l) / 2 };
}
function m15(o: number, h: number, l: number, cl: number, i: number): Candle {
  return { openTimeMs: i * 15 * 60 * 1000, open: o, high: h, low: l, close: cl };
}

describe('runLiquidityStrategy', () => {
  it('produces a BUY ENTRY_READY signal after a low sweep + bullish reaction, targeting the prior high', () => {
    // 4H structure: a swing LOW at 1.0850 (index 3) and a swing HIGH at 1.1000 (index 6).
    // Index 1's high (1.0997) is a prior, non-pivot approach to that same
    // 1.1000 level — this is what makes the eventual high "engineered"
    // (touched 2+ times) rather than a one-off pivot, which the strategy
    // now requires before it will use a level as a target.
    const structureCandles = [
      h4(1.090, 1.087, 0),
      h4(1.0997, 1.086, 1), // prior touch of the ~1.1000 level, respected (closes well below it)
      h4(1.088, 1.086, 2),
      h4(1.087, 1.085, 3), // swing LOW 1.0850
      h4(1.089, 1.086, 4),
      h4(1.091, 1.088, 5),
      h4(1.100, 1.095, 6), // swing HIGH 1.1000 (now engineered: 2 touches)
      h4(1.098, 1.096, 7),
      h4(1.097, 1.095, 8),
      h4(1.096, 1.094, 9)
    ];

    // 15m entry candles: first sweep the 1.0850 low (wick below, close back above), then a bullish pin bar reaction
    const entryCandles = [
      m15(1.0860, 1.0862, 1.0830, 1.0855, 0), // sweep candle: low 1.0830 < 1.0850, close 1.0855 > 1.0850
      { openTimeMs: 1, open: 1.0856, high: 1.0862, low: 1.0820, close: 1.0860 } // bullish pin bar reaction
    ];

    const signal = runLiquidityStrategy({
      symbol: 'EUR/USD',
      structureCandles,
      entryCandles,
      nowMs: Date.now()
    });

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('UP');
    expect(signal?.takeProfit).toBeCloseTo(1.1000);
    expect(signal?.stopLoss).toBeLessThan(1.083);
    expect(signal?.sweptSwing.kind).toBe('LOW');
  });

  it('returns null when there is no sweep at all', () => {
    const structureCandles = [h4(1.090, 1.087, 0), h4(1.089, 1.086, 1), h4(1.088, 1.086, 2), h4(1.087, 1.085, 3), h4(1.089, 1.086, 4), h4(1.091, 1.088, 5), h4(1.100, 1.095, 6), h4(1.098, 1.096, 7), h4(1.097, 1.095, 8), h4(1.096, 1.094, 9)];
    const entryCandles = [m15(1.086, 1.0865, 1.0855, 1.086, 0)];
    const signal = runLiquidityStrategy({ symbol: 'EUR/USD', structureCandles, entryCandles, nowMs: Date.now() });
    expect(signal).toBeNull();
  });
});
