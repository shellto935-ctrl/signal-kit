import http from 'node:http';
import { config, assertLiveConfig } from './config.js';
import { runBacktest } from './backtest.js';
import { startPoller } from './poller.js';
import { buildSignalChartPng } from './chart.js';
import { formatSignalMessage } from './format.js';
import { sendTelegramPhoto } from './telegram.js';
import { reviewSignalWithGemini } from './ai-agent.js';
import type { Candle, LiquiditySignal } from './types.js';

assertLiveConfig();

/** Builds a plausible-looking synthetic EUR/USD candle series + signal so
 * /test-alert can preview the exact real message format (chart + caption)
 * without waiting for a genuine market setup. */
function buildSampleSignal(): { entryCandles: Candle[]; signal: LiquiditySignal } {
  const now = Date.now();
  const step = 15 * 60 * 1000;
  const base = 1.0860;
  const entryCandles: Candle[] = [];
  for (let i = 0; i < 30; i++) {
    const drift = Math.sin(i / 4) * 0.0015;
    const o = base + drift;
    const c = o + (Math.random() - 0.5) * 0.0006;
    const h = Math.max(o, c) + Math.random() * 0.0004;
    const l = Math.min(o, c) - Math.random() * 0.0004;
    entryCandles.push({ openTimeMs: now - (30 - i) * step, open: o, high: h, low: l, close: c });
  }
  // Force the last few candles into an obvious sweep + bullish reaction shape.
  entryCandles[27] = { openTimeMs: entryCandles[27].openTimeMs, open: 1.0845, high: 1.0847, low: 1.0828, close: 1.0844 };
  entryCandles[28] = { openTimeMs: entryCandles[28].openTimeMs, open: 1.0844, high: 1.0862, low: 1.0840, close: 1.0860 };
  entryCandles[29] = { openTimeMs: entryCandles[29].openTimeMs, open: 1.0860, high: 1.0868, low: 1.0858, close: 1.0865 };

  const signal: LiquiditySignal = {
    type: 'ENTRY_READY',
    symbol: 'EUR/USD',
    direction: 'UP',
    entryPrice: 1.0860,
    stopLoss: 1.0826,
    takeProfit: 1.1000,
    sweptSwing: { kind: 'LOW', price: 1.0830, candleIndex: 27, openTimeMs: entryCandles[27].openTimeMs, respected: true },
    reactionCandleIndex: 28,
    createdAtMs: now
  };
  return { entryCandles, signal };
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', dryRun: config.DRY_RUN }));
    return;
  }

  if (req.url === '/test-alert') {
    const { entryCandles, signal } = buildSampleSignal();
    const baseMessage = formatSignalMessage(signal);

    (async () => {
      try {
        const chartPng = await buildSignalChartPng(entryCandles, signal);
        let caption = baseMessage + '\n\n_(এটা একটা টেস্ট মেসেজ, real market signal না)_';
        if (config.AI_AGENT_ENABLED) {
          try {
            const review = await reviewSignalWithGemini(chartPng, signal);
            caption = `${baseMessage}\n\n🤖 *Gemini-এর liquidity analysis:*\n${review}\n\n_(এটা একটা টেস্ট মেসেজ, real market signal না)_`;
          } catch (err) {
            console.error('[test-alert] AI review failed:', err);
          }
        }
        await sendTelegramPhoto(chartPng, caption);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Test alert sent — check your Telegram. / টেস্ট অ্যালার্ট পাঠানো হয়েছে, Telegram চেক করো।');
      } catch (err) {
        console.error('[test-alert] failed:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Test alert failed — check Railway deploy logs for the error.');
      }
    })();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(config.PORT, () => {
  console.log(`liquidity-alert backend listening on ${config.PORT}, dryRun=${config.DRY_RUN}`);
});

async function main() {
  if (config.BACKTEST_ENABLED) {
    await runBacktest().catch((err) => console.error('[backtest] fatal error:', err));
  }
  startPoller();
}

main();
