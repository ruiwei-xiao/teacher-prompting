import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import OfferingCreateForm from "@/components/calibration/OfferingCreateForm";

export default async function NewOfferingPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl="/activity/new"
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
      <main className="flex-1 bg-gradient-to-br from-rose-50 via-emerald-50 to-pink-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header>
            <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
              Collaborative
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl dark:text-zinc-100">
              New team activity
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600 dark:text-zinc-400">
              Attach a sample bot, rubric, deployment brief, and transcript.
              Learners join from a shared link. When three have joined, they
              start a team together.
            </p>
          </header>
          <div className="mt-8 w-full rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur sm:p-8 dark:border-zinc-700 dark:bg-zinc-900/80">
            <OfferingCreateForm />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
