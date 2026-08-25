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
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="w-full min-w-0 py-6">
            <section className="w-full">
              <div className="text-center">
                <h1 className="type-display text-4xl text-slate-900 md:text-5xl dark:text-zinc-100">
                  Activity
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg dark:text-zinc-300">
                  {appName}
                </p>
                <Link
                  href={`/app/${appId}/editor`}
                  className="pressable mt-4 inline-flex text-sm font-medium text-sky-700 hover-ok:underline dark:text-sky-400"
                >
                  Back to editor
                </Link>
              </div>

              <BotActivityView appId={app.id} appName={appName} />
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
