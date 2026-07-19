import type { PortfolioData } from "@/lib/portfolioStorage";

export const BACKUP_VERSION = 2;
export const BACKUP_FILENAME = "portfolio-backup.json";

export interface PortfolioBackup {
  version: number;
  exportedAt: string;
  app: string;
  holdings: PortfolioData["holdings"];
  transactions: PortfolioData["transactions"];
}

export function createPortfolioBackup(data: PortfolioData): PortfolioBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Edge Trading",
    holdings: { ...data.holdings },
    transactions: [...data.transactions],
  };
}

export function downloadPortfolioBackup(data: PortfolioData): void {
  const backup = createPortfolioBackup(data);
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

function isValidHoldings(value: unknown): value is PortfolioData["holdings"] {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const symbols = ["BTC", "ETH", "SOL"] as const;

  return symbols.every((symbol) => {
    const amount = record[symbol];
    return typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
  });
}

function isValidTransactions(
  value: unknown,
): value is PortfolioData["transactions"] {
  if (!Array.isArray(value)) return true;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const tx = item as Record<string, unknown>;
    return (
      typeof tx.id === "string" &&
      typeof tx.date === "string" &&
      (tx.symbol === "BTC" || tx.symbol === "ETH" || tx.symbol === "SOL") &&
      typeof tx.amount === "number" &&
      typeof tx.priceUsd === "number" &&
      typeof tx.spentUsd === "number"
    );
  });
}

export function parsePortfolioBackup(raw: string): PortfolioData {
  const parsed = JSON.parse(raw) as Partial<PortfolioBackup> & {
    holdings?: unknown;
    transactions?: unknown;
  };

  if (parsed.holdings && isValidHoldings(parsed.holdings)) {
    return {
      holdings: parsed.holdings,
      transactions: isValidTransactions(parsed.transactions)
        ? (parsed.transactions ?? [])
        : [],
    };
  }

  if (isValidHoldings(parsed)) {
    return {
      holdings: parsed,
      transactions: [],
    };
  }

  throw new Error("Neplatný formát zálohy. Očakávaný súbor portfolio-backup.json.");
}

export async function readBackupFile(file: File): Promise<PortfolioData> {
  if (!file.name.endsWith(".json")) {
    throw new Error("Vyber prosím súbor vo formáte .json");
  }

  const text = await file.text();
  return parsePortfolioBackup(text);
}
