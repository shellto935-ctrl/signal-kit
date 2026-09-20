import type { LiquiditySignal } from './types.js';

/**
 * Decimal places follow standard broker/quote convention per instrument
 * type, not a single fixed precision — showing gold to 5 decimals (like a
 * forex pair) reads as a formatting bug even though the underlying number
 * is correct.
 */
function fmtPrice(p: number, symbol: string): string {
  if (symbol.includes('XAU') || symbol.includes('XAG')) return p.toFixed(2); // metals: 2 decimals
  if (symbol.includes('JPY')) return p.toFixed(3); // JPY pairs: 3 decimals
  return p.toFixed(5); // standard forex pairs: 5 decimals
}

/**
 * Formats a LiquiditySignal into a Bengali Telegram alert message.
 * Mirrors the style of the original alert-only system's format.ts.
 */
export function formatSignalMessage(signal: LiquiditySignal): string {
  const dirBn = signal.direction === 'UP' ? 'BUY (উপরে যাওয়ার সম্ভাবনা)' : 'SELL (নিচে যাওয়ার সম্ভাবনা)';
  const sweptBn = signal.sweptSwing.kind === 'LOW' ? 'নিচের লেভেল (LOW)' : 'উপরের লেভেল (HIGH)';
  const riskDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const rewardDistance = Math.abs(signal.takeProfit - signal.entryPrice);
  const rr = riskDistance > 0 ? (rewardDistance / riskDistance).toFixed(2) : 'N/A';
  const fp = (p: number) => fmtPrice(p, signal.symbol);

  return [
    `🔔 *Liquidity Sweep Signal*`,
    ``,
    `📈 *পেয়ার:* ${signal.symbol}`,
    `🧭 *ডিরেকশন:* ${dirBn}`,
    `💧 *যা sweep হয়েছে:* ${sweptBn} (${fp(signal.sweptSwing.price)})`,
    ``,
    `🎯 *Entry:* ${fp(signal.entryPrice)}`,
    `🛑 *Stop-loss:* ${fp(signal.stopLoss)}`,
    `🏁 *Projected/Target price:* ${fp(signal.takeProfit)} _(এই লেভেল আগে ${signal.targetSwing.touches} বার respected হয়েছে)_`,
    `⚖️ *Risk:Reward:* 1:${rr}`,
    ``,
    `⚠️ এখনই চার্ট দেখুন! কোনো অটোমেটিক ট্রেড হয়নি — এটা শুধু একটা অ্যালার্ট।`
  ].join('\n');
}
