import type { Candle, LiquiditySignal } from './types.js';

/**
 * Renders a candlestick chart (last N 15m candles around the signal) via
 * QuickChart.io — a hosted charting API — instead of a native canvas
 * library, to avoid native-dependency build issues on Railway (we already
 * hit one build problem this project; not repeating that pattern here).
 */
export async function buildSignalChartPng(entryCandles: Candle[], signal: LiquiditySignal): Promise<Buffer> {
  // Fewer, bigger candles read far more clearly on a phone screen than a
  // dense 40-candle strip — this was part of what made the first version
  // hard to read even after candles started rendering at all.
  const windowCandles = entryCandles.slice(-25);

  // Explicitly pad the y-axis to cover both the candles AND the signal
  // levels (entry/stop/target/swept). Without this, a target that's far
  // outside the visible candle range can end up clipped or the chart can
  // auto-scale so tightly the lines are hard to read.
  const candleLows = windowCandles.map((c) => c.low);
  const candleHighs = windowCandles.map((c) => c.high);
  const levels = [signal.entryPrice, signal.stopLoss, signal.takeProfit, signal.sweptSwing.price];
  const yMin = Math.min(...candleLows, ...levels);
  const yMax = Math.max(...candleHighs, ...levels);
  const pad = (yMax - yMin) * 0.08;

  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: signal.symbol,
          barPercentage: 0.7,
          categoryPercentage: 0.9,
          data: windowCandles.map((c, i) => ({
            // Plain numeric index instead of a timestamp/date string: a
            // 'time' x-scale needs a date adapter to parse values, and if
            // that silently fails the candlestick controller draws nothing
            // (which is what happened in production) while unrelated
            // elements like annotation lines still render fine.
            x: i,
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close
          }))
        }
      ]
    },
    options: {
      plugins: {
        title: { display: true, text: `${signal.symbol} — liquidity sweep signal`, font: { size: 18 } },
        legend: { display: false },
        annotation: {
          annotations: {
            entry: hLine(signal.entryPrice, 'Entry', '#2e7d32'),
            stop: hLine(signal.stopLoss, 'Stop', '#c62828'),
            target: hLine(signal.takeProfit, 'Target', '#1565c0'),
            swept: hLine(signal.sweptSwing.price, 'Swept level', '#f9a825')
          }
        }
      },
      scales: {
        x: { type: 'linear', ticks: { display: false }, title: { display: true, text: 'recent candles →' } },
        y: { min: yMin - pad, max: yMax + pad }
      }
    }
  };

  const res = await fetch('https://quickchart.io/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chart: chartConfig,
      width: 900,
      height: 560,
      backgroundColor: 'white',
      format: 'png',
      version: '3'
    })
  });
  if (!res.ok) {
    throw new Error(`QuickChart failed: ${res.status} ${await res.text()}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (buf.length < 500) {
    // A valid PNG chart is always much larger than this; a tiny buffer
    // usually means QuickChart returned an error image instead of a real
    // chart. Fail loudly here rather than silently sending a blank photo.
    throw new Error(`QuickChart returned a suspiciously small image (${buf.length} bytes) — likely a render error, not a real chart.`);
  }
  return buf;
}

function hLine(value: number, label: string, color: string) {
  return { type: 'line', yMin: value, yMax: value, borderColor: color, borderWidth: 1.5, label: { display: true, content: label, position: 'end' } };
}
