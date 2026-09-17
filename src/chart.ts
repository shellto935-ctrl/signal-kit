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
          data: windowCandles.map((c) => ({
            x: new Date(c.openTimeMs).toISOString(),
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
        annotation: {
          annotations: {
            entry: hLine(signal.entryPrice, 'Entry', '#2e7d32'),
            stop: hLine(signal.stopLoss, 'Stop', '#c62828'),
            target: hLine(signal.takeProfit, 'Target', '#1565c0'),
            swept: hLine(signal.sweptSwing.price, 'Swept level', '#f9a825')
          }
        }
      },
      scales: { x: { type: 'time' } }
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
      // Candlestick charts need chartjs-chart-financial, which QuickChart
      // only loads for Chart.js v3+ — omitting this was the cause of the
      // "400" errors seen in production (QuickChart doesn't recognize the
      // 'candlestick' type on its default older Chart.js version).
      version: '3'
    })
  });
  if (!res.ok) {
    throw new Error(`QuickChart failed: ${res.status} ${await res.text()}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function hLine(value: number, label: string, color: string) {
  return { type: 'line', yMin: value, yMax: value, borderColor: color, borderWidth: 1.5, label: { display: true, content: label, position: 'end' } };
}
