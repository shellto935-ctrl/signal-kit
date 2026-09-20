import type { Candle, SwingPoint } from './types.js';

function averageTrueRange(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  const window = trueRanges.slice(-period);
  return window.reduce((sum, tr) => sum + tr, 0) / window.length;
}

/**
 * Counts how many separate times, before a swing point formed, price
 * approached within `tolerance` of its level and reacted away (a "touch"),
 * treating a run of consecutive nearby candles as a single touch rather
 * than counting every candle in a cluster separately. The pivot's own
 * formation always counts as at least one touch.
 */
function countPriorTouches(candles: Candle[], kind: 'HIGH' | 'LOW', price: number, beforeIndex: number, tolerance: number): number {
  let touches = 1; // the pivot's own formation
  let inCluster = false;
  for (let i = 0; i < beforeIndex; i++) {
    const level = kind === 'HIGH' ? candles[i].high : candles[i].low;
    const near = Math.abs(level - price) <= tolerance;
    // Never count a candle that actually closed through the level — that's
    // a break of structure, not a respectful "touch" of resting liquidity.
    const closedThrough = kind === 'HIGH' ? candles[i].close > price : candles[i].close < price;
    if (near && !closedThrough) {
      if (!inCluster) {
        touches += 1;
        inCluster = true;
      }
    } else {
      inCluster = false;
    }
  }
  return touches;
}

/**
 * Detects structural swing highs/lows on the 4H (or any "structure")
 * timeframe using a simple N-bar fractal: a candle is a swing high if its
 * high is strictly greater than the high of `lookback` candles on each
 * side, and a swing low is the mirror case.
 *
 * This directly encodes the "high respected, price moves away" idea: a
 * fractal pivot only forms once price has moved away on both sides, which
 * is the same as saying the level was "respected". Each point is further
 * annotated with `touches`/`engineered` — how many separate times price
 * approached that level before it — matching the "Da Vinci model" idea
 * that a level respected multiple times ("engineered liquidity") is a far
 * more trustworthy target than a one-off pivot.
 */
export function detectSwingPoints(candles: Candle[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  const atr = averageTrueRange(candles, 14);
  const tolerance = atr * 0.3;

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const c = candles[i];

    const isHigh = window.every((w) => w.high <= c.high) && window.some((w) => w !== c && w.high < c.high);
    if (isHigh) {
      const touches = countPriorTouches(candles, 'HIGH', c.high, i, tolerance);
      points.push({ kind: 'HIGH', price: c.high, candleIndex: i, openTimeMs: c.openTimeMs, respected: true, touches, engineered: touches >= 2 });
      continue;
    }

    const isLow = window.every((w) => w.low >= c.low) && window.some((w) => w !== c && w.low > c.low);
    if (isLow) {
      const touches = countPriorTouches(candles, 'LOW', c.low, i, tolerance);
      points.push({ kind: 'LOW', price: c.low, candleIndex: i, openTimeMs: c.openTimeMs, respected: true, touches, engineered: touches >= 2 });
    }
  }
  return points;
}

/** Unswept swing points still holding resting liquidity, most recent first. */
export function unsweptSwings(points: SwingPoint[], sweptOpenTimesMs: Set<number>): SwingPoint[] {
  return points.filter((p) => !sweptOpenTimesMs.has(p.openTimeMs)).slice().reverse();
}
