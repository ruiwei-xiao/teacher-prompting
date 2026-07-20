"use client";

import { useParams } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import InviteJoinLanding from "@/components/workspace/InviteJoinLanding";

export default function WorkspaceInviteJoinPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <aside className="hidden w-64 shrink-0 md:block">
            <WorkspaceSidebar />
          </aside>

          <section className="min-w-0 flex-1">
            {token ? (
              <InviteJoinLanding token={token} />
            ) : (
              <p className="text-red-700 dark:text-red-300">
                Missing invite token
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
