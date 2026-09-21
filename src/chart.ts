import type { Candle, LiquiditySignal } from './types.js';

/**
 * Renders a candlestick chart (last N 15m candles around the signal) via
 * QuickChart.io — a hosted charting API — instead of a native canvas
 * library, to avoid native-dependency build issues on Railway (we already
 * hit one build problem this project; not repeating that pattern here).
 *
 * Dark theme (TradingView-style navy/black) and explicit point markers for
 * ENTRY and the SWEPT candle, not just flat lines, so the picture alone
 * tells the story: where liquidity was taken, and where to enter.
 */
export async function buildSignalChartPng(entryCandles: Candle[], signal: LiquiditySignal): Promise<Buffer> {
  // Fewer, bigger candles read far more clearly on a phone screen than a
  // dense 40-candle strip — this was part of what made the first version
  // hard to read even after candles started rendering at all.
  const WINDOW = 25;
  const windowCandles = entryCandles.slice(-WINDOW);
  // signal.sweepCandleIndex / reactionCandleIndex are indices into the FULL
  // entryCandles array, not the sliced window — translate them, and simply
  // omit the point marker (keep the line) if the point fell outside the
  // visible window.
  const offset = entryCandles.length - windowCandles.length;
  const sweepX = signal.sweepCandleIndex - offset;
  const entryX = signal.reactionCandleIndex - offset;
  const inWindow = (x: number) => x >= 0 && x < windowCandles.length;

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

  const gridColor = '#2a2e39';
  const textColor = '#d1d4dc';

  const annotations: Record<string, unknown> = {
    entry: hLine(signal.entryPrice, 'Entry', '#4caf50'),
    stop: hLine(signal.stopLoss, 'Stop', '#ff5252'),
    target: hLine(signal.takeProfit, 'Target', '#42a5f5'),
    swept: hLine(signal.sweptSwing.price, 'Swept level', '#ffb300')
  };
  if (inWindow(sweepX)) {
    annotations.sweepPoint = point(sweepX, signal.sweptSwing.price, '💧 SWEEP', '#ffb300');
  }
  if (inWindow(entryX)) {
    annotations.entryPoint = point(entryX, signal.entryPrice, '🎯 ENTRY HERE', '#4caf50');
  }

  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: signal.symbol,
          barPercentage: 0.7,
          categoryPercentage: 0.9,
          color: { up: '#26a69a', down: '#ef5350', unchanged: '#999999' },
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
        title: { display: true, text: `${signal.symbol} — liquidity sweep signal (15m)`, color: textColor, font: { size: 18 } },
        legend: { display: false },
        annotation: { annotations }
      },
      scales: {
        x: { type: 'linear', ticks: { display: false }, grid: { color: gridColor }, title: { display: true, text: 'recent 15m candles →', color: textColor } },
        y: { min: yMin - pad, max: yMax + pad, ticks: { color: textColor }, grid: { color: gridColor } }
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
      backgroundColor: '#131722',
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
  return {
    type: 'line',
    yMin: value,
    yMax: value,
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [6, 4],
    label: { display: true, content: label, position: 'end', backgroundColor: color, color: '#131722', font: { weight: 'bold' } }
  };
}

function point(x: number, y: number, label: string, color: string) {
  return {
    type: 'point',
    xValue: x,
    yValue: y,
    radius: 6,
    backgroundColor: color,
    borderColor: '#131722',
    borderWidth: 2,
    label: { display: true, content: label, color: '#131722', backgroundColor: color, font: { weight: 'bold' }, position: 'start', yAdjust: -18 }
  };
}
