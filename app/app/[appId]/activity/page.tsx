import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import BotActivityView from "@/components/sessions/BotActivityView";
import { getAppById } from "@/lib/app-store/store";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    notFound();
  }

  const app = await getAppById(appId, userId);
  if (!app) {
    notFound();
  }

  const appName = app.name || app.id;

  return (
    <AppShell>
      <main className="main-viewport flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8">
          <header className="shrink-0">
            <Link
              href={`/app/${appId}/editor`}
              className="pressable -ml-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-sky-700 hover-ok:bg-sky-50 dark:text-sky-400 dark:hover-ok:bg-sky-950/40"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ‹
              </span>
              Back to editor
            </Link>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                Activity
              </p>
              <h1 className="type-display text-2xl text-slate-900 md:text-3xl dark:text-zinc-100">
                {appName}
              </h1>
            </div>
          </header>
          <BotActivityView appId={app.id} appName={appName} />
        </div>
      </main>
    </AppShell>
  );
}
