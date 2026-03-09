import { auth } from "@/auth";
import TopNav from "@/components/app-shell/TopNav";
import SignInPanel from "@/components/auth/SignInPanel";
import AppGrid from "@/components/dashboard/AppGrid";
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
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10">
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
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
          <section className="w-full text-center">
            <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-700">
              My Bots
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Build and manage your tutoring bots
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
              Open an existing bot, keep iterating on the prompt, or create a
              new one for a different course or teaching goal.
            </p>
          </section>

          <section className="mt-10 w-full">
            <AppGrid />
          </section>
        </div>
      </main>
    </div>
  );
}
