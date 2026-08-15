import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import SpaceLayout from "@/components/calibration/SpaceLayout";
import { getSpace } from "@/lib/calibration-api/space";
import { teamSpacePath } from "@/lib/calibration-ui/gate";

export default async function TeamSpacePage({
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

  const result = await getSpace(session.user.id ?? null, teamId);
  if (!result.ok) {
    return (
      <AppShell>
        <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100">
              {result.status === 403 ? "Access denied" : "Team not found"}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
              {result.body.error}
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <SpaceLayout
          teamId={teamId}
          viewerUserId={session.user.id ?? ""}
          initialSpace={result.body}
        />
      </main>
    </AppShell>
  );
}
