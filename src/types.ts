export interface Candle {
  openTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Direction = 'UP' | 'DOWN';

/** A 4H structural pivot (potential liquidity resting point). */
export interface SwingPoint {
  kind: 'HIGH' | 'LOW';
  price: number;
  candleIndex: number; // index into the 4H candle array
  openTimeMs: number;
  /** True once later price has moved away without re-testing it (i.e. "respected"). */
  respected: boolean;
  /**
   * How many separate times price approached this level (within tolerance)
   * without closing through it, counting the pivot's own formation as one.
   * Marco Trades' "Da Vinci model" calls a level with 2+ touches "engineered
   * liquidity" — repeated respect is what marks it as a real liquidity pool
   * worth targeting, versus a one-off pivot that could be noise.
   */
  touches: number;
  engineered: boolean;
}

/** A detected sweep of a swing point on the entry timeframe. */
export interface SweepEvent {
  swing: SwingPoint;
  sweepCandleIndex: number; // index into the 15m candle array
  sweepExtreme: number; // the wick extreme that pierced the swing level
}

export type SignalType = 'ENTRY_READY';

export interface LiquiditySignal {
  type: SignalType;
  symbol: string;
  direction: Direction; // direction of the trade to take
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  sweptSwing: SwingPoint;
  targetSwing: SwingPoint;
  reactionCandleIndex: number;
  createdAtMs: number;
}
