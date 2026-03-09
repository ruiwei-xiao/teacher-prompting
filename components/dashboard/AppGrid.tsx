// components/dashboard/AppGrid.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppCard from "./AppCard";

type AppSummary = {
  id: string;
  name: string;
  description?: string;
};

export default function AppGrid() {
  const router = useRouter();
  const [app, setApp] = useState<AppSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadApps() {
      try {
        const res = await fetch("/api/apps");
        const body = await res.json();
        const firstApp = body?.apps?.[0];

        if (res.ok && firstApp) {
          setApp(firstApp);
          return;
        }
      } catch {}

      setApp(null);
    }

    void loadApps().finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <AppCard
        title="Example Bot"
        desc={
          loading
            ? "Loading your example bot..."
            : "A minimal example you can open, edit, preview, and publish as a web chatbot."
        }
        ctaLabel={app ? "Open example" : "Create example"}
        onOpen={() =>
          router.push(app ? `/app/${app.id}/editor` : "/create")
        }
        meta={app?.name ? `Using: ${app.name}` : "Start from a single clean example"}
      />

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="text-sm font-medium text-slate-800">Or start fresh</div>
        <p className="mt-1 text-sm text-slate-600">
          Create a new bot from scratch with your own model, API key, and system
          prompt.
        </p>
        <button
          type="button"
          onClick={() => router.push("/create")}
          className="mt-4 h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Create new bot
        </button>
      </div>
    </div>
  );
}
