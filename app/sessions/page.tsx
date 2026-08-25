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
                  My sessions
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg dark:text-zinc-300">
                  Revisit conversations you have had with any bot — including
                  editor tests and chats that are not shared with the owner.
                </p>
              </div>

              <MySessionsView />
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
