"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, Settings, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  downloadPortfolioBackup,
  readBackupFile,
} from "@/lib/portfolioBackup";
import type { PortfolioData } from "@/lib/portfolioStorage";
import { interactiveButton } from "@/lib/motion";

interface SettingsModalProps {
  open: boolean;
  portfolioData: PortfolioData;
  onClose: () => void;
  onImport: (data: PortfolioData) => void;
}

export function SettingsModal({
  open,
  portfolioData,
  onClose,
  onImport,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus(null);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const handleExport = () => {
    try {
      downloadPortfolioBackup(portfolioData);
      setStatus({
        type: "success",
        message: "Záloha bola úspešne stiahnutá do zariadenia.",
      });
    } catch {
      setStatus({
        type: "error",
        message: "Export zlyhal. Skús to prosím znova.",
      });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      const imported = await readBackupFile(file);
      onImport(imported);
      setStatus({
        type: "success",
        message: "Dáta boli obnovené. Portfólio je aktualizované.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Import zlyhal. Skontroluj formát súboru.",
      });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Zavrieť nastavenia"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl sm:m-4 sm:rounded-3xl"
          >
            <div className="pointer-events-none absolute -left-10 top-0 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-orange-500/10 blur-3xl" />

            <div className="relative">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <Settings className="h-5 w-5 text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Nastavenia
                    </p>
                    <h2
                      id="settings-title"
                      className="mt-1 text-xl font-bold text-white"
                    >
                      Záloha portfólia
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-6 text-sm leading-relaxed text-zinc-500">
                Tvoje zostatky sú uložené len v tomto prehliadači. Pravidelne si
                ich zálohuj, aby si ich mohol presunúť medzi mobilom, tabletom
                alebo PC bez straty dát.
              </p>

              <div className="space-y-3">
                <motion.button
                  type="button"
                  onClick={handleExport}
                  {...interactiveButton}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3.5 text-sm font-semibold text-blue-300 shadow-[0_0_24px_rgba(59,130,246,0.15)] transition-colors hover:bg-blue-500/15"
                >
                  <Download className="h-4 w-4" />
                  Zálohovať dáta (Export)
                </motion.button>

                <motion.button
                  type="button"
                  onClick={handleImportClick}
                  {...interactiveButton}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3.5 text-sm font-semibold text-orange-300 shadow-[0_0_24px_rgba(249,115,22,0.15)] transition-colors hover:bg-orange-500/15"
                >
                  <Upload className="h-4 w-4" />
                  Obnoviť dáta (Import)
                </motion.button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {status && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    status.type === "success"
                      ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-400"
                      : "border-red-400/20 bg-red-400/5 text-red-400"
                  }`}
                >
                  {status.message}
                </motion.p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface SettingsButtonProps {
  onClick: () => void;
}

export function SettingsButton({ onClick }: SettingsButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Otvoriť nastavenia"
      {...interactiveButton}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#111113] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
    >
      <Settings className="h-4 w-4" />
    </motion.button>
  );
}
