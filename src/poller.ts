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

          // Always try to send the chart image — a picture makes the level
          // instantly readable, whether or not the AI text review succeeds.
          // Only the AI-review step is optional/best-effort; chart failure
          // is the sole reason to fall back to a text-only message.
          try {
            const chartPng = await buildSignalChartPng(entryCandles, signal);
            let caption = baseMessage;

            if (config.AI_AGENT_ENABLED) {
              try {
                const review = await reviewSignalWithGemini(chartPng, signal);
                caption = `${baseMessage}\n\n🤖 *Gemini-এর liquidity analysis:*\n${review}`;
              } catch (err) {
                console.error(`[poller] AI review failed for ${symbol}, sending chart without it:`, err);
              }
            }

            await sendTelegramPhoto(chartPng, caption);
          } catch (err) {
            console.error(`[poller] chart build failed for ${symbol}, sending text-only alert:`, err);
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
