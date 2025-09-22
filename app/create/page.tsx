"use client";

import { useRouter } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import CreateAppForm from "@/components/forms/CreateAppForm";

export default function CreateAppPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-rose-50 via-emerald-50 to-pink-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex gap-8">
          <aside className="w-64 shrink-0 hidden md:block">
            <WorkspaceSidebar />
          </aside>
          <section className="min-w-0 flex-1">
            <h1 className="text-3xl md:text-4xl font-bold">Create a new App</h1>
            <p className="mt-2 text-slate-600">Apps are the AI-powered experiences you build and share.</p>
            <div className="mt-8 max-w-3xl">
              <CreateAppForm onCreate={(id) => router.push(`/app/${id}/tour`)} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
