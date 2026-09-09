"use client";

import { useId, type ReactNode } from "react";
import type { WorkspaceRole } from "@/lib/workspace-store/types";
import {
  WORKSPACE_ROLE_EXPLANATIONS,
  WORKSPACE_ROLE_HINT_IDS,
} from "@/lib/workspace-ui/role-explanations";

export default function WorkspaceRoleHint({
  role,
  children,
  align = "start",
}: {
  role: WorkspaceRole;
  children?: ReactNode;
  align?: "start" | "end";
}) {
  const uid = useId();
  const explanation = WORKSPACE_ROLE_EXPLANATIONS[role];
  const tooltipId = `${WORKSPACE_ROLE_HINT_IDS[role]}-${uid}`;
  const origin =
    align === "end"
      ? "right-0 origin-top-right"
      : "left-0 origin-top-left";

  return (
    <span className="group relative inline-flex items-center gap-0.5 overflow-visible">
      {children ?? (
        <span className="text-sm font-medium text-slate-700 dark:text-zinc-200">
          {explanation.title}
        </span>
      )}
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold leading-none text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        aria-label={`About ${explanation.title}`}
        aria-describedby={tooltipId}
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute top-full z-30 mt-1 block w-64 max-w-[min(16rem,calc(100vw-1.5rem))] ${origin} scale-[0.97] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs leading-snug text-slate-700 opacity-0 shadow-sm transition-[opacity,transform] duration-150 ease-[var(--ease-out)] group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200`}
      >
        {explanation.summary}
      </span>
    </span>
  );
}
