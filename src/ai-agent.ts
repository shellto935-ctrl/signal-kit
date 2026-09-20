import { config } from './config.js';
import type { LiquiditySignal } from './types.js';

const PROMPT_PREFIX = `You are an experienced ICT/Smart-Money-Concepts trader reviewing an automated "liquidity sweep reversal" alert before it reaches a retail trader, built on what's sometimes called the "Da Vinci model." You are given a candlestick chart image and the alert's computed levels.

Think like a trader who reads liquidity, not like a pattern-matching script. Walk through this specific reasoning on the chart image:

1. RETAIL POSITIONING: Looking at the visible structure (the swing highs/lows, any obvious support/resistance or round numbers on the chart), where would typical retail traders likely be entering right now — buying dips at "support," selling at "resistance," or chasing the breakout candle? Name the approximate price area.
2. RETAIL STOPS: Given that retail entry, where would their stop-losses most likely cluster (just beyond the nearest swing point, a fixed pip amount, etc.)? That cluster is where resting liquidity sits.
3. SWEEP CHECK: Does the chart show price actually wick through that liquidity cluster and close back inside — a genuine stop-hunt — or does it look like a clean breakout/continuation (which would make this alert's reversal premise weak)?
4. ENGINEERED LIQUIDITY AT THE TARGET: The alert's target is a level the system has already confirmed price has approached and respected more than once (see "Target touches" below) — that repetition is what makes it "engineered" liquidity worth trading toward, not a random pivot. Does the chart visually support that this target level looks like a real, well-established magnet for price (multiple visible wicks/highs clustering near it), or does it look weaker than the stated touch count suggests?
5. BETTER ENTRY: Independent of the alert's own entry price, if you were trading this setup yourself, is there a price level that would give a better risk:reward than the alert's entry (e.g. waiting for a deeper retest, or an area retail hasn't been swept from yet)? Say so in one line, or say the given entry already looks reasonable.
6. VERDICT: One line — LOOKS VALID, BORDERLINE, or LOOKS WEAK.

Keep the whole reply under 150 words, structured with short labels for each of the 6 points above. This is analysis for a human to read and decide for themselves — you are not placing a trade, and nothing you say here automatically changes the alert's entry, stop-loss, or target.`;

// Uses Google's Interactions API (the current recommended Gemini API as of
// mid-2026 — the older generateContent endpoint still works but this is
// what Google's own docs point new integrations to). See:
// https://ai.google.dev/gemini-api/docs/interactions-overview
// https://ai.google.dev/gemini-api/docs/image-understanding
export async function reviewSignalWithGemini(chartPng: Buffer, signal: LiquiditySignal): Promise<string> {
  const base64Image = chartPng.toString('base64');

  const signalSummary = `Symbol: ${signal.symbol}
Direction: ${signal.direction}
Swept level: ${signal.sweptSwing.kind} at ${signal.sweptSwing.price}
Entry: ${signal.entryPrice}
Stop-loss: ${signal.stopLoss}
Target: ${signal.takeProfit}
Target touches (times price has respected this level before, per the system's own detection): ${signal.targetSwing.touches}`;

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.GEMINI_API_KEY
    },
    body: JSON.stringify({
      model: 'gemini-3.8-flash',
      input: [
        { type: 'text', text: PROMPT_PREFIX + '\n\n' + signalSummary },
        { type: 'image', data: base64Image, mime_type: 'image/png' }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(`Gemini API failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, unknown>;

  if (typeof data.output_text === 'string') return data.output_text;

  const output = data.output as { content?: { type: string; text?: string }[] }[] | undefined;
  if (Array.isArray(output)) {
    for (const step of output) {
      const textPart = step.content?.find((c) => c.type === 'text')?.text;
      if (textPart) return textPart;
    }
  }

  console.error('[ai-agent] unrecognized Gemini response shape:', JSON.stringify(data).slice(0, 500));
  return '(Gemini did not return a recognizable text review)';
}

// Uses BlueMinds (api.bluesminds.com) — another free-credit third-party
// router, OpenAI-compatible endpoint. NOTE: unlike AgentRouter, BlueMinds
// has no public documentation or verified provenance — treat this as an
// experiment, not something to depend on for a live bot.
export async function reviewSignalWithGpt6BlueMinds(chartPng: Buffer, signal: LiquiditySignal): Promise<string> {
  const base64Image = chartPng.toString('base64');
  const dataUrl = `data:image/png;base64,${base64Image}`;

  const signalSummary = `Symbol: ${signal.symbol}
Direction: ${signal.direction}
Swept level: ${signal.sweptSwing.kind} at ${signal.sweptSwing.price}
Entry: ${signal.entryPrice}
Stop-loss: ${signal.stopLoss}
Target: ${signal.takeProfit}
Target touches (times price has respected this level before, per the system's own detection): ${signal.targetSwing.touches}`;

  const res = await fetch('https://api.bluesminds.com/v1/chat/completions', {
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
    throw new Error(`BlueMinds/GPT-6 API failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content ?? '(GPT-6 did not return a text review)';
}
