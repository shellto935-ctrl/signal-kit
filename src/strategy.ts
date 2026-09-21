import type { Candle, LiquiditySignal, SwingPoint } from './types.js';
import { detectSwingPoints, unsweptSwings } from './structure.js';
import { findSweep } from './sweep.js';
import { findReaction } from './reaction.js';

const STOP_BUFFER = 0.0002; // ~2 pips buffer beyond the sweep extreme, on top of the wick itself
const MIN_RISK_REWARD = 1.5; // reject setups where the nearest engineered target barely clears the entry

export interface StrategyInput {
  symbol: string;
  structureCandles: Candle[]; // 4H
  entryCandles: Candle[]; // 15m
  alreadySweptOpenTimesMs?: Set<number>;
  nowMs: number;
}

/**
 * One pass of the liquidity-sweep-reversal logic (the "Da Vinci model"
 * variant):
 *  1. Find 4H swing highs/lows ("resting liquidity"), each annotated with
 *     how many times price has respected that level before ("engineered"
 *     liquidity = touched 2+ times, per Marco Trades' framing — a level
 *     the market has proven it cares about, not a one-off pivot).
 *  2. For each unswept swing, check if the 15m series has swept it
 *     (wick through, close back inside).
 *  3. After a sweep, look for a reversal reaction candle.
 *  4. If found, build a signal: entry at reaction close, stop beyond the
 *     sweep extreme, target the nearest opposite-side ENGINEERED swing —
 *     a target that's just a single unconfirmed pivot is rejected, even if
 *     it's the nearest one, because the model's edge specifically comes
 *     from targeting liquidity the market has already shown it respects.
 *
 * Returns at most one signal per call (the most recent qualifying setup) —
 * callers run this once per new 15m candle close.
 */
export function runLiquidityStrategy(input: StrategyInput): LiquiditySignal | null {
  const { symbol, structureCandles, entryCandles, nowMs } = input;
  const swept = input.alreadySweptOpenTimesMs ?? new Set<number>();

  const swings = detectSwingPoints(structureCandles, 3);
  const candidates = unsweptSwings(swings, swept);

  for (const swing of candidates) {
    const sweepEvent = findSweep(entryCandles, swing, 0);
    if (!sweepEvent) continue;

    const direction = swing.kind === 'HIGH' ? 'DOWN' : 'UP';
    const reactionIdx = findReaction(entryCandles, sweepEvent.sweepCandleIndex, direction, 3);
    if (reactionIdx === null) continue;

    const reactionCandle = entryCandles[reactionIdx];
    const entryPrice = reactionCandle.close;
    const stopLoss =
      direction === 'UP' ? sweepEvent.sweepExtreme - STOP_BUFFER : sweepEvent.sweepExtreme + STOP_BUFFER;

    const oppositeKind = swing.kind === 'HIGH' ? 'LOW' : 'HIGH';
    // Try engineered targets nearest-first, but skip any that would give a
    // poor risk:reward (this is the bug behind the 1:0.07 signal seen in
    // production — the nearest engineered level was barely past entry).
    const targets = pickOppositeTargets(swings, oppositeKind, entryPrice, direction);
    const riskDistance = Math.abs(entryPrice - stopLoss);
    const target = selectTargetByMinRR(targets, entryPrice, riskDistance);
    if (!target) continue;

    return {
      type: 'ENTRY_READY',
      symbol,
      direction,
      entryPrice,
      stopLoss,
      takeProfit: target.price,
      targetSwing: target,
      sweptSwing: swing,
      sweepCandleIndex: sweepEvent.sweepCandleIndex,
      reactionCandleIndex: reactionIdx,
      createdAtMs: nowMs
    };
  }

  return null;
}

/**
 * Only considers "engineered liquidity" targets — swing points that price
 * has approached and respected more than once, per the Da Vinci model's
 * core requirement. Targeting a one-off pivot isn't this model; it's just
 * noise that happens to look like a swing point. Returns candidates
 * nearest-first so the caller can walk outward until one clears the
 * minimum risk:reward.
 */
function pickOppositeTargets(
  swings: SwingPoint[],
  oppositeKind: 'HIGH' | 'LOW',
  fromPrice: number,
  direction: 'UP' | 'DOWN'
): SwingPoint[] {
  const pool = swings.filter((s) => s.kind === oppositeKind && s.engineered);
  if (direction === 'UP') {
    // Nearest opposite-side liquidity ABOVE the entry price, closest first.
    return pool.filter((s) => s.price > fromPrice).sort((a, b) => a.price - b.price);
  }
  return pool.filter((s) => s.price < fromPrice).sort((a, b) => b.price - a.price);
}

/**
 * Picks the first (nearest) target whose reward:risk clears MIN_RISK_REWARD.
 * Exported standalone so this specific decision — the actual fix for the
 * 1:0.07 signal bug — can be unit-tested directly with plain numbers,
 * instead of only indirectly through hand-built candle fixtures.
 */
export function selectTargetByMinRR(targets: SwingPoint[], entryPrice: number, riskDistance: number): SwingPoint | undefined {
  if (riskDistance <= 0) return undefined;
  return targets.find((t) => Math.abs(t.price - entryPrice) / riskDistance >= MIN_RISK_REWARD);
}
