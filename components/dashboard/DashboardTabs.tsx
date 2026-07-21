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
      <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-none">
        <div className="relative grid grid-cols-2 gap-2">
          <div
            aria-hidden
            className="tab-indicator pointer-events-none absolute inset-y-0 left-0 w-[calc(50%-0.25rem)] rounded-[1.25rem] bg-sky-600 shadow-sm"
            style={{
              transform: `translateX(calc(${activeIndex} * (100% + 0.5rem)))`,
            }}
          />
          <button
            type="button"
            onClick={() => setActiveTab("my-bots")}
            className={`pressable relative z-10 h-12 rounded-[1.25rem] px-4 text-sm font-semibold transition-colors duration-200 ${
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
            className={`pressable relative z-10 h-12 rounded-[1.25rem] px-4 text-sm font-semibold transition-colors duration-200 ${
              activeTab === "community"
                ? "text-white"
                : "text-slate-600 hover-ok:text-slate-900 dark:text-zinc-300 dark:hover-ok:text-zinc-100"
            }`}
          >
            Community
          </button>
        </div>
      </div>

      <div className="mt-8">
        {activeTab === "my-bots" ? myBots : community}
      </div>
    </div>
  );
}
