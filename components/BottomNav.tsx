"use client";

import { motion } from "framer-motion";
import { Home, Newspaper, PieChart, Repeat } from "lucide-react";

type Tab = "home" | "news" | "portfolio" | "dca";

interface BottomNavProps {
  activeTab?: Tab;
}

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "news", label: "News", icon: Newspaper },
  { id: "portfolio", label: "Portfolio", icon: PieChart },
  { id: "dca", label: "DCA", icon: Repeat },
];

export function BottomNav({ activeTab = "portfolio" }: BottomNavProps) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/5 bg-black/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              className="group relative flex flex-col items-center gap-1 px-4 py-1"
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span className="absolute -top-3 h-1 w-8 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
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
                className={`text-[10px] font-medium ${
                  isActive ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
