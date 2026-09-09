"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  BuildingPermissions,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";
import {
  parseWorkspaceGetResponse,
  shouldShowHubSelfLeave,
} from "@/lib/workspace-ui/hub";
import {
  buildRemoveMemberBody,
  membersApiHref,
  parseMembersMutationResponse,
} from "@/lib/workspace-ui/members";
import { resolveWorkspaceTab } from "@/lib/workspace-ui/tabs";
import WorkspaceActivityView from "@/components/workspace/WorkspaceActivityView";
import WorkspaceBotGrid from "@/components/workspace/WorkspaceBotGrid";
import WorkspaceMemberList from "@/components/workspace/WorkspaceMemberList";
import WorkspacePermissionsForm from "@/components/workspace/WorkspacePermissionsForm";
import WorkspaceRoleHint from "@/components/workspace/WorkspaceRoleHint";

type HubState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      name: string;
      role: WorkspaceRole;
      permissions: BuildingPermissions;
      assistedAuthoringModeDefault: boolean;
      currentUserId: string;
    };

function HubSelfLeaveControl({
  workspaceId,
  currentUserId,
}: {
  workspaceId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  async function handleSelfLeave() {
    if (!currentUserId || leaveBusy) return;
    setLeaveBusy(true);
    setLeaveError("");
    try {
      const res = await fetch(membersApiHref(workspaceId), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRemoveMemberBody(currentUserId)),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseMembersMutationResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      router.push(MY_BOTS_HREF);
      router.refresh();
    } catch (e: unknown) {
      setLeaveError(
        e instanceof Error ? e.message : "Failed to leave this Workspace"
      );
      setLeaveBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirmLeave ? (
        <button
          type="button"
          onClick={() => setConfirmLeave(true)}
          disabled={leaveBusy}
          className="pressable inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover-ok:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover-ok:bg-zinc-800"
        >
          Leave Workspace…
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void handleSelfLeave()}
            disabled={leaveBusy}
            className="pressable inline-flex h-8 items-center rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover-ok:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {leaveBusy ? "Leaving…" : "Confirm leave"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmLeave(false)}
            disabled={leaveBusy}
            className="pressable inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium text-slate-600 hover-ok:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover-ok:bg-zinc-800"
          >
            Cancel
          </button>
        </>
      )}
      {leaveError ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {leaveError}
        </p>
      ) : null}
    </div>
  );
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
          assistedAuthoringModeDefault:
            parsed.workspace.assistedAuthoringModeDefault,
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
    return (
      <p className="text-slate-600 dark:text-zinc-300">Loading…</p>
    );
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
    state.role
  );

  const activityLayout = activeTab === "activity";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            Workspace
          </span>
          <h1 className="type-display truncate text-2xl text-slate-900 md:text-3xl dark:text-zinc-100">
            {state.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <WorkspaceRoleHint role={state.role}>
            <span className="text-sm text-slate-600 dark:text-zinc-300">
              Your role: {roleLabel}
            </span>
          </WorkspaceRoleHint>
          {shouldShowHubSelfLeave({ role: state.role, activeTab }) ? (
            <HubSelfLeaveControl
              workspaceId={workspaceId}
              currentUserId={state.currentUserId}
            />
          ) : null}
        </div>
      </div>

      <div
        className={
          activityLayout
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        }
      >
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
            initialAssistedAuthoringModeDefault={
              state.assistedAuthoringModeDefault
            }
            role={state.role}
          />
        ) : activeTab === "members" ? (
          <WorkspaceMemberList
            workspaceId={workspaceId}
            role={state.role}
            currentUserId={state.currentUserId}
          />
        ) : activeTab === "activity" ? (
          <WorkspaceActivityView workspaceId={workspaceId} />
        ) : null}
      </div>
    </div>
  );
}

export default function WorkspaceHub({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={<p className="text-slate-600 dark:text-zinc-300">Loading…</p>}
      >
        <WorkspaceHubInner workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}
