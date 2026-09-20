import { describe, it, expect } from 'vitest';
import { formatSignalMessage } from '../src/format.js';
import type { LiquiditySignal } from '../src/types.js';

const signal: LiquiditySignal = {
  type: 'ENTRY_READY',
  symbol: 'EUR/USD',
  direction: 'UP',
  entryPrice: 1.0860,
  stopLoss: 1.0828,
  takeProfit: 1.1000,
  sweptSwing: { kind: 'LOW', price: 1.085, candleIndex: 3, openTimeMs: 0, respected: true, touches: 1, engineered: false },
  targetSwing: { kind: 'HIGH', price: 1.1000, candleIndex: 9, openTimeMs: 100, respected: true, touches: 3, engineered: true },
  reactionCandleIndex: 1,
  createdAtMs: Date.now()
};

describe('formatSignalMessage', () => {
  it('includes symbol, direction, entry, stop, and target price', () => {
    const msg = formatSignalMessage(signal);
    expect(msg).toContain('EUR/USD');
    expect(msg).toContain('BUY');
    expect(msg).toContain('1.08600');
    expect(msg).toContain('1.08280');
    expect(msg).toContain('1.10000');
    expect(msg).toContain('অটোমেটিক ট্রেড হয়নি');
    expect(msg).toContain('3 বার respected');
  });

  it('formats gold (XAU/USD) prices with 2 decimals, not 5', () => {
    const goldSignal: LiquiditySignal = { ...signal, symbol: 'XAU/USD', entryPrice: 4343.96711, stopLoss: 4341.25904, takeProfit: 4348.55869 };
    const msg = formatSignalMessage(goldSignal);
    expect(msg).toContain('4343.97');
    expect(msg).toContain('4341.26');
    expect(msg).not.toContain('4343.96711');
  });
});
