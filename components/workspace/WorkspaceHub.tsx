"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  BuildingPermissions,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";
import {
  resolveWorkspaceTab,
  type WorkspaceTab,
} from "@/lib/workspace-ui/tabs";
import WorkspaceBotGrid from "@/components/workspace/WorkspaceBotGrid";
import WorkspaceInvitePanel from "@/components/workspace/WorkspaceInvitePanel";
import WorkspaceMemberList from "@/components/workspace/WorkspaceMemberList";
import WorkspaceNavTabs from "@/components/workspace/WorkspaceNavTabs";
import WorkspacePermissionsForm from "@/components/workspace/WorkspacePermissionsForm";

type HubState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      name: string;
      role: WorkspaceRole;
      permissions: BuildingPermissions;
      currentUserId: string;
    };

function tabDescription(tab: WorkspaceTab, roleLabel: string): string {
  switch (tab) {
    case "bots":
      return `Your role: ${roleLabel}`;
    case "settings":
      return "Rename this Workspace, edit building permissions, or delete it if you are the Owner.";
    case "invites":
      return "Invite educators with a copyable link or a pending email.";
    case "members":
      return "Search the roster, change roles, remove members, transfer ownership, or leave.";
  }
}

function WorkspaceHubInner({ workspaceId }: { workspaceId: string }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const [state, setState] = useState<HubState>({ status: "loading" });

  useEffect(() => {
    if (!workspaceId) {
      setState({ status: "error", message: "Missing workspace id" });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [workspaceRes, sessionRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}`),
          fetch("/api/auth/session"),
        ]);
        const body = await workspaceRes.json().catch(() => ({}));
        const sessionBody = await sessionRes.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseWorkspaceGetResponse(workspaceRes.status, body);
        if (!parsed.ok) {
          setState({ status: "error", message: parsed.error });
          return;
        }
        const currentUserId =
          typeof sessionBody?.user?.id === "string" ? sessionBody.user.id : "";
        if (!currentUserId) {
          setState({
            status: "error",
            message: "Signed-in user id is required",
          });
          return;
        }
        setState({
          status: "ready",
          name: parsed.workspace.name,
          role: parsed.role,
          permissions: parsed.workspace.buildingPermissions,
          currentUserId,
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

  const activeTab = resolveWorkspaceTab(
    `/workspace/${workspaceId}`,
    tabParam,
    workspaceId,
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
          Workspace
        </div>
        <h1 className="type-display mt-4 text-3xl text-slate-900 dark:text-zinc-100">
          {state.name}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
          {tabDescription(activeTab, roleLabel)}
        </p>
        <div className="mt-6">
          <WorkspaceNavTabs workspaceId={workspaceId} />
        </div>
      </div>

      {activeTab === "bots" ? (
        <WorkspaceBotGrid
          workspaceId={workspaceId}
          role={state.role}
          permissions={state.permissions}
        />
      ) : activeTab === "settings" ? (
        <WorkspacePermissionsForm
          workspaceId={workspaceId}
          initialName={state.name}
          initialPermissions={state.permissions}
          role={state.role}
        />
      ) : activeTab === "invites" ? (
        <WorkspaceInvitePanel workspaceId={workspaceId} role={state.role} />
      ) : (
        <WorkspaceMemberList
          workspaceId={workspaceId}
          role={state.role}
          currentUserId={state.currentUserId}
        />
      )}
    </div>
  );
}

export default function WorkspaceHub({ workspaceId }: { workspaceId: string }) {
  return (
    <Suspense
      fallback={<p className="text-slate-600 dark:text-zinc-300">Loading…</p>}
    >
      <WorkspaceHubInner workspaceId={workspaceId} />
    </Suspense>
  );
}
