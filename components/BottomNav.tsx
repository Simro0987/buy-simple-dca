"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Home, Newspaper, PieChart, Repeat } from "lucide-react";
import { interactiveButton } from "@/lib/motion";

export type Tab = "home" | "news" | "portfolio" | "dca" | "swap";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Domov", icon: Home },
  { id: "news", label: "Novinky", icon: Newspaper },
  { id: "portfolio", label: "Portfólio", icon: PieChart },
  { id: "dca", label: "DCA", icon: Repeat },
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/5 bg-black/60 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-4"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-0.5">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              {...interactiveButton}
              className="group relative flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1"
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span className="absolute -top-3 h-1 w-7 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              )}
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive
                    ? "text-emerald-400"
                    : "text-zinc-500 group-hover:text-zinc-300"
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`truncate text-[9px] font-medium sm:text-[10px] ${
                  isActive ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
}
