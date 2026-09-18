function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  PORT: Number(process.env.PORT ?? 3000),
  TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY ?? '',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  AI_AGENT_ENABLED: (process.env.AI_AGENT_ENABLED ?? 'false').toLowerCase() === 'true',
  DRY_RUN: (process.env.DRY_RUN ?? 'true').toLowerCase() === 'true',
  BACKTEST_ENABLED: (process.env.BACKTEST_ENABLED ?? 'false').toLowerCase() === 'true',
  // How many days of history to pull for the one-shot backtest report.
  // Kept modest (<=45d) so a single Twelve Data call per timeframe stays
  // well within the free-tier output-size limit (no pagination needed yet).
  BACKTEST_DAYS: Number(process.env.BACKTEST_DAYS ?? 45)
};

export function assertLiveConfig() {
  required('TWELVEDATA_API_KEY');
  if (!config.DRY_RUN) {
    required('TELEGRAM_BOT_TOKEN');
    required('TELEGRAM_CHAT_ID');
  }
  if (config.AI_AGENT_ENABLED) {
    required('OPENAI_API_KEY');
  }
}
