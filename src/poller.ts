import { config } from './config.js';
import { fetchCandles } from './market/twelvedata.js';
import { runLiquidityStrategy } from './strategy.js';
import { formatSignalMessage } from './format.js';
import { sendTelegramMessage, sendTelegramPhoto } from './telegram.js';
import { buildSignalChartPng } from './chart.js';
import { reviewSignalWithGemini } from './ai-agent.js';

const SYMBOLS = ['EUR/USD', 'GBP/USD', 'XAU/USD'];
const POLL_INTERVAL_MS = 15 * 60 * 1000;

// In-memory only for this MVP: resets on redeploy/restart, meaning a swing
// that was already swept before a restart could theoretically re-alert
// once. Acceptable for an alert-only system (worst case: one duplicate
// message); flagged here rather than silently assumed durable.
const sweptBySymbol = new Map<string, Set<number>>();
const alertedReactionKeys = new Set<string>();

async function pollOnce() {
  for (const symbol of SYMBOLS) {
    try {
      const structureCandles = await fetchCandles(config.TWELVEDATA_API_KEY, symbol, '4h', 80);
      const entryCandles = await fetchCandles(config.TWELVEDATA_API_KEY, symbol, '15min', 60);

      const swept = sweptBySymbol.get(symbol) ?? new Set<number>();
      sweptBySymbol.set(symbol, swept);

      const signal = runLiquidityStrategy({
        symbol,
        structureCandles,
        entryCandles,
        alreadySweptOpenTimesMs: swept,
        nowMs: Date.now()
      });

      if (signal) {
        const key = `${symbol}:${signal.sweptSwing.openTimeMs}:${signal.reactionCandleIndex}`;
        if (!alertedReactionKeys.has(key)) {
          alertedReactionKeys.add(key);
          swept.add(signal.sweptSwing.openTimeMs);

          const baseMessage = formatSignalMessage(signal);

          if (config.AI_AGENT_ENABLED) {
            try {
              const chartPng = await buildSignalChartPng(entryCandles, signal);
              const review = await reviewSignalWithGemini(chartPng, signal);
              const combined = `${baseMessage}\n\n🤖 *Gemini-এর liquidity analysis:*\n${review}`;
              await sendTelegramPhoto(chartPng, combined);
            } catch (err) {
              console.error(`[poller] AI review failed for ${symbol}, sending plain alert instead:`, err);
              await sendTelegramMessage(baseMessage);
            }
          } else {
            await sendTelegramMessage(baseMessage);
          }

          console.log(`[poller] sent signal for ${symbol}`, signal);
        }
      }
    } catch (err) {
      console.error(`[poller] error for ${symbol}:`, err);
    }
  }
}

export function startPoller() {
  console.log('[poller] starting, interval =', POLL_INTERVAL_MS, 'ms');
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);
}
