import TopNav from "@/components/app-shell/TopNav";
import AppGrid from "@/components/dashboard/AppGrid";

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
          <section className="w-full text-center">
            <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-700">
              Example
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Try one simple example bot
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
              Start from a single example instead of a full dashboard. Open the
              bot, edit the prompt, and publish a web chatbot when you are ready.
            </p>
          </section>

          <section className="mt-10 w-full max-w-xl">
            <AppGrid />
          </section>
        </div>
      </main>
    </div>
  );
}
