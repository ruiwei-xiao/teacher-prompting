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
}: {
  role: WorkspaceRole;
  children?: ReactNode;
}) {
  const uid = useId();
  const explanation = WORKSPACE_ROLE_EXPLANATIONS[role];
  const tooltipId = `${WORKSPACE_ROLE_HINT_IDS[role]}-${uid}`;

  return (
    <span className="group relative inline-flex items-center gap-0.5">
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
        title={explanation.summary}
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs leading-snug text-slate-700 shadow-sm group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {explanation.summary}
      </span>
    </span>
  );
}
