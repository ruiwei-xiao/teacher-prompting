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

  return (
    <div className="w-full">
      <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-none">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab("my-bots")}
            className={`h-12 rounded-[1.25rem] px-4 text-sm font-semibold transition ${
              activeTab === "my-bots"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            My bots
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("community")}
            className={`h-12 rounded-[1.25rem] px-4 text-sm font-semibold transition ${
              activeTab === "community"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
