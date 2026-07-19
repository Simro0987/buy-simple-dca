import type { HoldingsMap } from "@/lib/portfolioStorage";

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME = "portfolio-backup.json";

export interface PortfolioBackup {
  version: number;
  exportedAt: string;
  app: string;
  holdings: HoldingsMap;
}

export function createPortfolioBackup(holdings: HoldingsMap): PortfolioBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Edge Trading",
    holdings: {
      BTC: holdings.BTC,
      ETH: holdings.ETH,
      SOL: holdings.SOL,
    },
  };
}

export function downloadPortfolioBackup(holdings: HoldingsMap): void {
  const backup = createPortfolioBackup(holdings);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = BACKUP_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isValidHoldings(value: unknown): value is HoldingsMap {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const symbols = ["BTC", "ETH", "SOL"] as const;

  return symbols.every((symbol) => {
    const amount = record[symbol];
    return typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
  });
}

export function parsePortfolioBackup(raw: string): HoldingsMap {
  const parsed = JSON.parse(raw) as Partial<PortfolioBackup> & {
    holdings?: unknown;
  };

  if (parsed.holdings && isValidHoldings(parsed.holdings)) {
    return parsed.holdings;
  }

  if (isValidHoldings(parsed)) {
    return parsed;
  }

  throw new Error("Neplatný formát zálohy. Očakávaný súbor portfolio-backup.json.");
}

export async function readBackupFile(file: File): Promise<HoldingsMap> {
  if (!file.name.endsWith(".json")) {
    throw new Error("Vyber prosím súbor vo formáte .json");
  }

  const text = await file.text();
  return parsePortfolioBackup(text);
}
