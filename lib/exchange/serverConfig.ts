export interface ExchangeServerConfig {
  provider: "binance" | "none";
  liveEnabled: boolean;
  apiKey: string | null;
  apiSecret: string | null;
  baseUrl: string;
}

export function getExchangeServerConfig(): ExchangeServerConfig {
  const apiKey = process.env.BINANCE_API_KEY?.trim() || null;
  const apiSecret = process.env.BINANCE_API_SECRET?.trim() || null;
  const liveEnabled =
    process.env.EXCHANGE_LIVE_ENABLED === "true" &&
    Boolean(apiKey && apiSecret);

  const provider =
    process.env.EXCHANGE_PROVIDER?.trim().toLowerCase() === "binance" ||
    Boolean(apiKey)
      ? "binance"
      : "none";

  return {
    provider: provider as ExchangeServerConfig["provider"],
    liveEnabled,
    apiKey,
    apiSecret,
    baseUrl:
      process.env.BINANCE_API_BASE_URL?.trim() ||
      "https://api.binance.com",
  };
}

export function assertLiveExchangeReady(config: ExchangeServerConfig): void {
  if (!config.liveEnabled) {
    throw new Error(
      "Live trading is not configured. Set BINANCE_API_KEY, BINANCE_API_SECRET, and EXCHANGE_LIVE_ENABLED=true on the server.",
    );
  }
}
