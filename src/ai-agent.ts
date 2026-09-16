import { config } from './config.js';
import type { LiquiditySignal } from './types.js';

const PROMPT_PREFIX = `You are reviewing an automated forex "liquidity sweep reversal" trade alert before it is shown to a retail trader. You are given a candlestick chart image and the alert's computed levels. Look at the chart and:
1. Confirm or dispute whether the chart visually shows a genuine liquidity sweep (wick beyond a prior swing level, close back inside) followed by a real reversal reaction — not just noise.
2. Note anything concerning (e.g. the reaction candle looks weak, price is in a strong opposing trend, the target level looks too far/close).
3. Give a one-line verdict: LOOKS VALID, BORDERLINE, or LOOKS WEAK.
Keep your whole reply under 80 words. This is not financial advice and you are not placing any trade — you are only annotating an alert for a human to review themselves.`;

const AGENTROUTER_BASE_URL = 'https://agentrouter.org/v1/chat/completions';

export async function reviewSignalWithGpt6(chartPng: Buffer, signal: LiquiditySignal): Promise<string> {
  const base64Image = chartPng.toString('base64');
  const dataUrl = `data:image/png;base64,${base64Image}`;

  const signalSummary = `Symbol: ${signal.symbol}
Direction: ${signal.direction}
Swept level: ${signal.sweptSwing.kind} at ${signal.sweptSwing.price}
Entry: ${signal.entryPrice}
Stop-loss: ${signal.stopLoss}
Target: ${signal.takeProfit}`;

  const res = await fetch(AGENTROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-6-astra',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT_PREFIX + '\n\n' + signalSummary },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(`AgentRouter/GPT-6 API failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content ?? '(GPT-6 did not return a text review)';
}
