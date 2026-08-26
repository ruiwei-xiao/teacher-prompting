import { auth } from "@/auth";
import AppShell from "@/components/app-shell/AppShell";
import SignInPanel from "@/components/auth/SignInPanel";
import MySessionsView from "@/components/sessions/MySessionsView";
import { MY_SESSIONS_HREF } from "@/lib/chat-session-ui/nav";

export default async function MySessionsPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl={MY_SESSIONS_HREF}
          googleEnabled={Boolean(
            process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
          )}
          microsoftEnabled={Boolean(
            process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
            process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
            process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          )}
        />
      </main>
    );
  }

  return (
    <AppShell>
      <main className="main-viewport flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8">
          <header className="shrink-0">
            <h1 className="type-display text-2xl text-slate-900 md:text-3xl dark:text-zinc-100">
              My sessions
            </h1>
          </header>
          <MySessionsView />
        </div>
      </main>
    </AppShell>
  );
}
