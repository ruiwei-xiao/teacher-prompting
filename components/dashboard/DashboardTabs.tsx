"use client";

import { useState } from "react";

export default function DashboardTabs({
  myBots,
  community,
}: {
  myBots: React.ReactNode;
  community: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"my-bots" | "community">("my-bots");
  const activeIndex = activeTab === "my-bots" ? 0 : 1;

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-md rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-none">
        <div className="relative grid grid-cols-2 gap-1">
          <div
            aria-hidden
            className="tab-indicator pointer-events-none absolute inset-y-0 left-0 w-[calc(50%-0.125rem)] rounded-full bg-sky-600 shadow-sm"
            style={{
              transform: `translateX(calc(${activeIndex} * (100% + 0.25rem)))`,
            }}
          />
          <button
            type="button"
            onClick={() => setActiveTab("my-bots")}
            className={`pressable relative z-10 h-9 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ease-[var(--ease-out)] ${
              activeTab === "my-bots"
                ? "text-white"
                : "text-slate-600 hover-ok:text-slate-900 dark:text-zinc-300 dark:hover-ok:text-zinc-100"
            }`}
          >
            My bots
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("community")}
            className={`pressable relative z-10 h-9 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ease-[var(--ease-out)] ${
              activeTab === "community"
                ? "text-white"
                : "text-slate-600 hover-ok:text-slate-900 dark:text-zinc-300 dark:hover-ok:text-zinc-100"
            }`}
          >
            Community
          </button>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === "my-bots" ? myBots : community}
      </div>
    </div>
  );
}
