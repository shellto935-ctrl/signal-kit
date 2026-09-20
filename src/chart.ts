import type { Candle, LiquiditySignal } from './types.js';

/**
 * Renders a candlestick chart (last N 15m candles around the signal) via
 * QuickChart.io — a hosted charting API — instead of a native canvas
 * library, to avoid native-dependency build issues on Railway (we already
 * hit one build problem this project; not repeating that pattern here).
 */
export async function buildSignalChartPng(entryCandles: Candle[], signal: LiquiditySignal): Promise<Buffer> {
  const windowCandles = entryCandles.slice(-40);

  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: signal.symbol,
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
        title: { display: true, text: `${signal.symbol} — liquidity sweep signal` },
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
        x: { type: 'linear', ticks: { display: false }, title: { display: true, text: 'recent candles →' } }
      }
    }
  };

  const res = await fetch('https://quickchart.io/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chart: chartConfig,
      width: 800,
      height: 500,
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
