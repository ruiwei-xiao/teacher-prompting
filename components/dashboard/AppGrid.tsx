// components/dashboard/AppGrid.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppCard from "./AppCard";
import DeleteBotDialog from "./DeleteBotDialog";
import PublishDialog from "@/components/editor/PublishDialog";

type AppSummary = {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  publicSlug?: string;
};

export default function AppGrid() {
  const router = useRouter();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AppSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [shareTarget, setShareTarget] = useState<AppSummary | null>(null);

  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  function getShareUrl(app: AppSummary) {
    if (!app.publishedAt || !appOrigin) return "";
    return `${appOrigin}/chat/${app.publicSlug || app.id}`;
  }

  useEffect(() => {
    async function loadApps() {
      try {
        const res = await fetch("/api/apps");
        const body = await res.json();
        if (res.ok && Array.isArray(body?.apps)) {
          setApps(body.apps);
          return;
        }
      } catch {}

      setApps([]);
    }

    void loadApps().finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleteBusy(true);
    setDeleteError("");

    try {
      const res = await fetch(`/api/apps/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error || "Failed to delete bot.");
      }

      setApps((current) => current.filter((app) => app.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete bot.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">My bots</h2>
          <p className="mt-1 text-sm text-slate-600">
            {loading
              ? "Loading your bots..."
              : apps.length
                ? `You have ${apps.length} bot${apps.length === 1 ? "" : "s"}.`
                : "You have not created any bots yet."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/create")}
          className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Create new bot
        </button>
      </div>

      {apps.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              badge={app.publishedAt ? "Published" : "Bot"}
              title={app.name}
              desc={
                app.description ||
                "No description yet. Open this bot to edit the prompt and settings."
              }
              meta={app.updatedAt ? `Updated ${new Date(app.updatedAt).toLocaleDateString()}` : undefined}
              ctaLabel="Open bot"
              onOpen={() => router.push(`/app/${app.id}/editor`)}
              onShare={() => setShareTarget(app)}
              onDelete={() => {
                setDeleteError("");
                setDeleteTarget(app);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">No bots yet</h3>
          <p className="mt-2 text-sm text-slate-600">
            Create your first bot to start designing prompts, previewing
            behavior, and publishing a chatbot.
          </p>
          <button
            type="button"
            onClick={() => router.push("/create")}
            className="mt-5 h-10 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700"
          >
            Create your first bot
          </button>
        </div>
      )}

      <DeleteBotDialog
        open={Boolean(deleteTarget)}
        botName={deleteTarget?.name || ""}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteError("");
          setDeleteTarget(null);
        }}
        onConfirm={() => void handleDelete()}
      />
      <PublishDialog
        open={Boolean(shareTarget)}
        url={shareTarget ? getShareUrl(shareTarget) : ""}
        error={
          shareTarget && !shareTarget.publishedAt
            ? "Publish this bot from the editor before sharing its public link."
            : undefined
        }
        onClose={() => setShareTarget(null)}
      />
    </div>
  );
}
