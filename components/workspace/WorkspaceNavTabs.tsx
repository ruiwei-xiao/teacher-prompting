"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    setNavReady(true);
  }, []);

  const active = navReady
    ? resolveWorkspaceTab(pathname, tabParam, workspaceId)
    : null;
  const activeIndex = active
    ? WORKSPACE_TABS.findIndex((tab) => tab.id === active)
    : -1;

  useLayoutEffect(() => {
    function measure() {
      if (activeIndex < 0) {
        setIndicator((prev) => ({ ...prev, ready: false }));
        return;
      }
      const container = containerRef.current;
      const tab = tabRefs.current[activeIndex];
      if (!container || !tab) return;
      const c = container.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      setIndicator({
        left: t.left - c.left,
        width: t.width,
        ready: true,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex, navReady]);

  return (
    <nav
      aria-label="Workspace sections"
      className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-1.5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-none"
    >
      <div
        ref={containerRef}
        className="relative flex gap-1.5 overflow-x-auto"
      >
        {indicator.ready && (
          <div
            aria-hidden
            className="tab-indicator pointer-events-none absolute top-0 bottom-0 rounded-[1.1rem] bg-sky-600 shadow-sm"
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.left}px)`,
            }}
          />
        )}
        {WORKSPACE_TABS.map((tab, index) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              href={workspaceTabHref(workspaceId, tab.id)}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={`pressable relative z-10 flex h-11 shrink-0 flex-1 items-center justify-center rounded-[1.1rem] px-3 text-sm font-semibold transition-colors duration-200 ${
                isActive
                  ? "text-white"
                  : "text-slate-600 hover-ok:text-slate-900 dark:text-zinc-300 dark:hover-ok:text-zinc-100"
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
