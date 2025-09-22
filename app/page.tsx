import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import AppGrid from "@/components/dashboard/AppGrid";

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-rose-50 via-emerald-50 to-sky-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex gap-8">
          <aside className="w-64 shrink-0 hidden md:block">
            <WorkspaceSidebar />
          </aside>
          <section className="min-w-0 flex-1">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Carnegie Mellon AI Collab Sandbox
            </h1>
            <AppGrid />
          </section>
        </div>
      </main>
    </div>
  );
}
