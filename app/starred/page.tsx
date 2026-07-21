import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import StarredBotGrid from "@/components/starred/StarredBotGrid";

export default async function StarredPage({
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
          callbackUrl={callbackUrl || "/starred"}
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

  return (
    <AppShell>
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="w-full min-w-0 py-6">
            <section className="w-full">
              <div className="text-center">
                <h1 className="type-display text-4xl text-slate-900 md:text-5xl dark:text-zinc-100">
                  Starred bots
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg dark:text-zinc-300">
                  Quick access to bots you pinned from My bots or a Workspace —
                  ordered by most recently starred.
                </p>
              </div>

              <div className="mt-10">
                <StarredBotGrid />
              </div>
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
