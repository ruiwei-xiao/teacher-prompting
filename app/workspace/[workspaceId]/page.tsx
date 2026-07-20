"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";

type HubState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; name: string; role: string };

/**
 * Temporary minimal Workspace hub (task 6.1 navigation target).
 * Full bot grid / place-unplace lands in task 6.2.
 */
export default function WorkspaceHubPage() {
  const params = useParams();
  const workspaceId =
    typeof params?.workspaceId === "string" ? params.workspaceId : "";
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
        if (!res.ok) {
          setState({
            status: "error",
            message:
              typeof body?.error === "string"
                ? body.error
                : "Failed to load workspace",
          });
          return;
        }
        const name =
          typeof body?.workspace?.name === "string"
            ? body.workspace.name
            : "Workspace";
        const role = typeof body?.role === "string" ? body.role : "";
        setState({ status: "ready", name, role });
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

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <aside className="hidden w-64 shrink-0 md:block">
            <WorkspaceSidebar />
          </aside>

          <section className="min-w-0 flex-1">
            {state.status === "loading" && (
              <p className="text-slate-600 dark:text-zinc-300">Loading…</p>
            )}

            {state.status === "error" && (
              <div className="space-y-3">
                <p className="text-red-700 dark:text-red-300">{state.message}</p>
                <Link
                  href={MY_BOTS_HREF}
                  className="inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  Back to My bots
                </Link>
              </div>
            )}

            {state.status === "ready" && (
              <div>
                <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  Temporary hub — bot grid arrives in 6.2
                </div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                  {state.name}
                </h1>
                {state.role && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
                    Your role: {state.role}
                  </p>
                )}
                <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-zinc-300">
                  This placeholder confirms navigation into the Workspace. Placed
                  bots and place/unplace controls will land in a follow-up task.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
