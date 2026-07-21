import {
  normalizePortfolioData,
  type PortfolioData,
} from "@/lib/portfolioStorage";

export const BACKUP_VERSION = 3;
export const BACKUP_FILENAME = "portfolio-backup.json";

export interface PortfolioBackup {
  version: number;
  exportedAt: string;
  app: string;
  assets: PortfolioData["assets"];
  transactions: PortfolioData["transactions"];
}

export function createPortfolioBackup(data: PortfolioData): PortfolioBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Edge Trading",
    assets: [...data.assets],
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

function isValidTransactions(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const tx = item as Record<string, unknown>;
    return (
      typeof tx.id === "string" &&
      typeof tx.date === "string" &&
      typeof tx.amount === "number"
    );
  });
}

export function parsePortfolioBackup(raw: string): PortfolioData {
  const parsed = JSON.parse(raw) as Partial<PortfolioBackup> & {
    holdings?: unknown;
    assets?: unknown;
    transactions?: unknown;
    version?: number;
  };

  if (parsed.version === 3 && Array.isArray(parsed.assets)) {
    if (!isValidTransactions(parsed.transactions)) {
      throw new Error("Neplatné transakcie v zálohe.");
    }

    return {
      version: 3,
      assets: parsed.assets as PortfolioData["assets"],
      transactions: (parsed.transactions ?? []) as PortfolioData["transactions"],
    };
  }

  if (parsed.holdings) {
    return normalizePortfolioData(parsed);
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
