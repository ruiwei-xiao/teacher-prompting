import Link from "next/link";
import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import { listMyOfferings } from "@/lib/calibration-api/offerings";
import { teamSpacePath } from "@/lib/calibration-ui/gate";
import {
  ACTIVITY_NEW_HREF,
  hubStatusLabel,
} from "@/lib/calibration-ui/offering";
import { operatePageHref } from "@/lib/calibration-ui/operator";

export default async function CalibrationHubPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl="/activity"
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

  const listed = await listMyOfferings(session.user.id ?? null);
  const offerings = listed.ok ? listed.body.offerings : [];

  return (
    <AppShell>
      <main className="flex-1 bg-gradient-to-br from-rose-50 via-emerald-50 to-pink-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
                Collaborative
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl dark:text-zinc-100">
                Activities
              </h1>
              <p className="mt-2 max-w-2xl text-slate-600 dark:text-zinc-400">
                Activities you created or joined. Learners start from the join
                link; after that, they come back here.
              </p>
            </div>
            <Link
              href={ACTIVITY_NEW_HREF}
              className="pressable inline-flex rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover-ok:bg-sky-800 dark:bg-sky-600 dark:hover-ok:bg-sky-500"
            >
              New activity
            </Link>
          </div>

          <section className="mt-10">
            {offerings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">
                  No activities yet
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                  Create one, or open the join link your instructor sent.
                </p>
                <Link
                  href={ACTIVITY_NEW_HREF}
                  className="pressable mt-5 inline-flex rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover-ok:bg-sky-800"
                >
                  Create an activity
                </Link>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {offerings.map((offering) => (
                  <li
                    key={offering.id}
                    className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80"
                  >
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                      {offering.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                      Created {offering.createdAt.slice(0, 10)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      {hubStatusLabel(offering)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {offering.isInstructor ? (
                        <Link
                          href={operatePageHref(offering.id)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover-ok:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover-ok:bg-zinc-700"
                        >
                          Progress
                        </Link>
                      ) : null}
                      {offering.teamId ? (
                        <Link
                          href={teamSpacePath(offering.id, offering.teamId)}
                          className="rounded-lg bg-sky-100 px-3 py-1.5 text-sm font-medium text-sky-800 hover-ok:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:hover-ok:bg-sky-900/60"
                        >
                          Open activity
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
