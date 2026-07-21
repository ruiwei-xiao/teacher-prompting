"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  WORKSPACE_TABS,
  resolveWorkspaceTab,
  workspaceTabHref,
  type WorkspaceTab,
} from "@/lib/workspace-ui/tabs";

export default function WorkspaceNavTabs({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    setNavReady(true);
  }, []);

  const active = navReady
    ? resolveWorkspaceTab(pathname, tabParam, workspaceId)
    : null;

  return (
    <nav
      aria-label="Workspace sections"
      className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-1.5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-none"
    >
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {WORKSPACE_TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={workspaceTabHref(workspaceId, tab.id)}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-11 items-center justify-center rounded-[1.1rem] px-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export type { WorkspaceTab };
