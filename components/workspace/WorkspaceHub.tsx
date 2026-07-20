"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  BuildingPermissions,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";
import { workspaceSettingsHref } from "@/lib/workspace-ui/settings";
import WorkspaceBotGrid from "@/components/workspace/WorkspaceBotGrid";

type HubState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      name: string;
      role: WorkspaceRole;
      permissions: BuildingPermissions;
    };

export default function WorkspaceHub({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [state, setState] = useState<HubState>({ status: "loading" });

  useEffect(() => {
    if (!workspaceId) {
      setState({ status: "error", message: "Missing workspace id" });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseWorkspaceGetResponse(res.status, body);
        if (!parsed.ok) {
          setState({ status: "error", message: parsed.error });
          return;
        }
        setState({
          status: "ready",
          name: parsed.workspace.name,
          role: parsed.role,
          permissions: parsed.workspace.buildingPermissions,
        });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Failed to load workspace" });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (state.status === "loading") {
    return <p className="text-slate-600 dark:text-zinc-300">Loading…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <p className="text-red-700 dark:text-red-300">{state.message}</p>
        <Link
          href={MY_BOTS_HREF}
          className="inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
        >
          Back to My bots
        </Link>
      </div>
    );
  }

  const roleLabel =
    state.role === "owner"
      ? "Owner"
      : state.role === "facilitator"
        ? "Facilitator"
        : "Participant";

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
          Workspace
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
          {state.name}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
          Your role: {roleLabel}. This list is for bots placed in this Workspace —
          not your personal My bots.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link
            href={MY_BOTS_HREF}
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            ← Back to My bots
          </Link>
          <Link
            href={workspaceSettingsHref(workspaceId)}
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            Settings
          </Link>
          <Link
            href={`${workspaceSettingsHref(workspaceId)}#members`}
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            Members
          </Link>
        </div>
      </div>

      <WorkspaceBotGrid
        workspaceId={workspaceId}
        role={state.role}
        permissions={state.permissions}
      />
    </div>
  );
}
