"use client";

import { useParams } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import PeerBotPreview from "@/components/workspace/PeerBotPreview";

export default function WorkspacePeerBotPage() {
  const params = useParams();
  const workspaceId =
    typeof params?.workspaceId === "string" ? params.workspaceId : "";
  const appId = typeof params?.appId === "string" ? params.appId : "";

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <aside className="hidden w-64 shrink-0 md:block">
            <WorkspaceSidebar />
          </aside>

          <section className="min-w-0 flex-1">
            {workspaceId && appId ? (
              <PeerBotPreview workspaceId={workspaceId} appId={appId} />
            ) : (
              <p className="text-red-700 dark:text-red-300">
                Missing workspace or bot id
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
