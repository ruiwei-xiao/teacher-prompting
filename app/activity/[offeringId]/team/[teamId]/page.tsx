import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import { teamSpacePath } from "@/lib/calibration-ui/gate";

export default async function TeamSpacePlaceholderPage({
  params,
}: {
  params: Promise<{ offeringId: string; teamId: string }>;
}) {
  const { offeringId, teamId } = await params;
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl={teamSpacePath(offeringId, teamId)}
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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
            Rubric Calibration
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-zinc-100">
            Team space
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">
            Your calibration team is ready. The shared room opens here.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
