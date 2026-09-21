import http from 'node:http';
import { config, assertLiveConfig } from './config.js';
import { runBacktest } from './backtest.js';
import { startPoller } from './poller.js';
import { buildSignalChartPng } from './chart.js';
import { formatSignalMessage } from './format.js';
import { sendTelegramPhoto } from './telegram.js';
import { reviewSignalWithGemini } from './ai-agent.js';
import { fetchCandles } from './market/twelvedata.js';
import { runLiquidityStrategy } from './strategy.js';
import type { Candle, LiquiditySignal } from './types.js';

assertLiveConfig();

/**
 * Fetches REAL, current EUR/USD candles and runs the actual strategy on
 * them for /test-alert, instead of synthetic fake data — so the preview
 * shows genuine market structure (and looks different each time you call
 * it) rather than the same canned shape every time.
 *
 * If no real setup exists right now (the common case — the whole point of
 * this strategy is that it's selective), an illustrative entry/stop/target
 * is layered onto the SAME real candles so the chart and its story are
 * still consistent, but clearly labeled as illustrative rather than a
 * genuine detected signal.
 */
async function buildPreviewSignal(): Promise<{ entryCandles: Candle[]; signal: LiquiditySignal; isReal: boolean }> {
  const structureCandles = await fetchCandles(config.TWELVEDATA_API_KEY, 'EUR/USD', '4h', 80);
  const entryCandles = await fetchCandles(config.TWELVEDATA_API_KEY, 'EUR/USD', '15min', 60);

  const real = runLiquidityStrategy({ symbol: 'EUR/USD', structureCandles, entryCandles, nowMs: Date.now() });
  if (real) {
    return { entryCandles, signal: real, isReal: true };
  }

  // No genuine setup right now — build an illustrative one from the same
  // real candles: last close as "entry", recent real high/low as target/stop.
  const last = entryCandles[entryCandles.length - 1];
  const recentHigh = Math.max(...entryCandles.slice(-20).map((c) => c.high));
  const recentLow = Math.min(...entryCandles.slice(-20).map((c) => c.low));
  const entryPrice = last.close;
  const stopLoss = recentLow - (recentHigh - recentLow) * 0.1;
  const takeProfit = recentHigh;

  const signal: LiquiditySignal = {
    type: 'ENTRY_READY',
    symbol: 'EUR/USD',
    direction: 'UP',
    entryPrice,
    stopLoss,
    takeProfit,
    sweptSwing: { kind: 'LOW', price: recentLow, candleIndex: 0, openTimeMs: last.openTimeMs, respected: true, touches: 1, engineered: false },
    targetSwing: { kind: 'HIGH', price: recentHigh, candleIndex: 0, openTimeMs: last.openTimeMs, respected: true, touches: 1, engineered: false },
    sweepCandleIndex: entryCandles.length - 1,
    reactionCandleIndex: entryCandles.length - 1,
    createdAtMs: Date.now()
  };
  return { entryCandles, signal, isReal: false };
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', dryRun: config.DRY_RUN }));
    return;
  }

  if (req.url === '/test-alert') {
    (async () => {
      try {
        const { entryCandles, signal, isReal } = await buildPreviewSignal();
        const baseMessage = formatSignalMessage(signal);
        const note = isReal
          ? '_(এটা বর্তমান বাজারে সত্যিই শনাক্ত হওয়া একটা signal — টেস্ট হিসেবে আগে পাঠানো হলো)_'
          : '_(এই মুহূর্তে বাজারে কোনো real signal নেই, তাই real চার্টের উপর illustrative entry/stop/target বসানো হয়েছে — শুধু ফরম্যাট দেখার জন্য)_';

        const chartPng = await buildSignalChartPng(entryCandles, signal);
        let caption = `${baseMessage}\n\n${note}`;
        if (config.AI_AGENT_ENABLED) {
          try {
            const review = await reviewSignalWithGemini(chartPng, signal);
            caption = `${baseMessage}\n\n🤖 *Gemini-এর liquidity analysis:*\n${review}\n\n${note}`;
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
