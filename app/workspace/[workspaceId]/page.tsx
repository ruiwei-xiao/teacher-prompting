"use client";

import { useParams } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import WorkspaceHub from "@/components/workspace/WorkspaceHub";

export default function WorkspaceHubPage() {
  const params = useParams();
  const workspaceId =
    typeof params?.workspaceId === "string" ? params.workspaceId : "";

  return (
    <AppShell>
      <main className="main-viewport flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
          {workspaceId ? (
            <WorkspaceHub workspaceId={workspaceId} />
          ) : (
            <p className="text-red-700 dark:text-red-300">
              Missing workspace id
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
