import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import CourseGateLanding from "@/components/calibration/CourseGateLanding";
import { getOfferingGate } from "@/lib/calibration-api/offerings";
import {
  landingPathFromGate,
  offeringGatePath,
} from "@/lib/calibration-ui/gate";

export default async function CourseGatePage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const { offeringId } = await params;
  const session = await auth();
  const gatePath = offeringGatePath(offeringId);

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl={gatePath}
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

  const result = await getOfferingGate(session.user.id ?? null, offeringId);
  if (!result.ok) {
    return (
      <AppShell>
        <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100">
              Offering not found
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
              This course-gate link is not available.
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  const next = landingPathFromGate(offeringId, result.body.me);
  if (next !== gatePath) {
    redirect(next);
  }

  return (
    <AppShell>
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <CourseGateLanding
            offeringId={offeringId}
            offeringTitle={result.body.offering.title}
            initial={result.body.me}
          />
        </div>
      </main>
    </AppShell>
  );
}
