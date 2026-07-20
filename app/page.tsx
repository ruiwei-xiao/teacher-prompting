import { auth } from "@/auth";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import SignInPanel from "@/components/auth/SignInPanel";
import AppGrid from "@/components/dashboard/AppGrid";
import CommunityGrid from "@/components/dashboard/CommunityGrid";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import { claimUnownedApps } from "@/lib/app-store/store";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl={callbackUrl || "/"}
          googleEnabled={Boolean(
            process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
          )}
          microsoftEnabled={Boolean(
            process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
              process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
              process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
          )}
        />
      </main>
    );
  }

  if (session.user.id) {
    await claimUnownedApps(session.user.id);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <aside className="hidden w-64 shrink-0 md:block">
            <WorkspaceSidebar />
          </aside>
          <div className="min-w-0 flex-1 flex flex-col items-center py-6">
            <DashboardTabs
              myBots={
                <section className="w-full">
                  <div className="text-center">
                    <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-200">
                      My Bots
                    </div>
                    <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl dark:text-zinc-100">
                      Build and manage your tutoring bots
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg dark:text-zinc-300">
                      Open an existing bot, keep iterating on the prompt, or create a
                      new one for a different course or teaching goal.
                    </p>
                  </div>

                  <div className="mt-10">
                    <AppGrid />
                  </div>
                </section>
              }
              community={
                <section className="w-full">
                  <div className="mb-6">
                    <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
                      Community
                    </div>
                    <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                      Explore published bots
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base dark:text-zinc-300">
                      Browse bots that have already been published. Open a chatbot
                      directly, or view the source project when the author shared it
                      publicly.
                    </p>
                  </div>
                  <CommunityGrid />
                </section>
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}
