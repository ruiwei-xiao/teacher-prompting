"use client";

import { useParams } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import PeerBotPreview from "@/components/workspace/PeerBotPreview";

export default function WorkspacePeerBotPage() {
  const params = useParams();
  const workspaceId =
    typeof params?.workspaceId === "string" ? params.workspaceId : "";
  const appId = typeof params?.appId === "string" ? params.appId : "";

  return (
    <AppShell>
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {workspaceId && appId ? (
            <PeerBotPreview workspaceId={workspaceId} appId={appId} />
          ) : (
            <p className="text-red-700 dark:text-red-300">
              Missing workspace or bot id
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
