"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import WorkspaceInvitePanel from "@/components/workspace/WorkspaceInvitePanel";
import WorkspaceMemberList from "@/components/workspace/WorkspaceMemberList";
import WorkspacePermissionsForm from "@/components/workspace/WorkspacePermissionsForm";
import type {
  BuildingPermissions,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { MY_BOTS_HREF, workspaceHubHref } from "@/lib/workspace-ui/nav";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";

type SettingsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      name: string;
      role: WorkspaceRole;
      permissions: BuildingPermissions;
      currentUserId: string;
    };

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId =
    typeof params?.workspaceId === "string" ? params.workspaceId : "";
  const [state, setState] = useState<SettingsState>({ status: "loading" });

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
          typeof sessionBody?.user?.id === "string"
            ? sessionBody.user.id
            : "";
        if (!currentUserId) {
          setState({
            status: "error",
            message: "Signed-in user id is required to manage members",
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
          setState({
            status: "error",
            message: "Failed to load workspace settings",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <aside className="hidden w-64 shrink-0 md:block">
            <WorkspaceSidebar />
          </aside>

          <section className="min-w-0 flex-1 space-y-8">
            {!workspaceId ? (
              <p className="text-red-700 dark:text-red-300">
                Missing workspace id
              </p>
            ) : state.status === "loading" ? (
              <p className="text-slate-600 dark:text-zinc-300">Loading…</p>
            ) : state.status === "error" ? (
              <div className="space-y-3">
                <p className="text-red-700 dark:text-red-300">{state.message}</p>
                <Link
                  href={MY_BOTS_HREF}
                  className="inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  Back to My bots
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    Settings
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                    {state.name}
                  </h1>
                  <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
                    Rename this Workspace, edit building permissions, invite
                    members, manage the roster, or delete it if you are the
                    Owner.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <Link
                      href={workspaceHubHref(workspaceId)}
                      className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                    >
                      ← Back to Workspace
                    </Link>
                    <a
                      href="#invites"
                      className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                    >
                      Invites
                    </a>
                    <a
                      href="#members"
                      className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                    >
                      Members
                    </a>
                    <Link
                      href={MY_BOTS_HREF}
                      className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                    >
                      My bots
                    </Link>
                  </div>
                </div>

                <WorkspacePermissionsForm
                  workspaceId={workspaceId}
                  initialName={state.name}
                  initialPermissions={state.permissions}
                  role={state.role}
                />

                <div
                  id="invites"
                  className="border-t border-slate-200 pt-8 dark:border-zinc-800"
                >
                  <WorkspaceInvitePanel
                    workspaceId={workspaceId}
                    role={state.role}
                  />
                </div>

                <div
                  id="members"
                  className="border-t border-slate-200 pt-8 dark:border-zinc-800"
                >
                  <WorkspaceMemberList
                    workspaceId={workspaceId}
                    role={state.role}
                    currentUserId={state.currentUserId}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
