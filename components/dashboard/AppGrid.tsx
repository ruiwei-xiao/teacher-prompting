// components/dashboard/AppGrid.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildEducatorSharePatchBody,
  educatorSharePatchErrorMessage,
} from "@/lib/workspace-api/share-patch-body";
import AppCard from "./AppCard";
import DeleteBotDialog from "./DeleteBotDialog";
import ShareDialog from "./ShareDialog";

type AppSummary = {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  publicSlug?: string;
  projectShareSlug?: string | null;
  projectShareVisibility?: "private" | "public";
  shareAuthorName?: boolean;
  communitySubject?: string | null;
  communityTags?: string[];
  forkedFromProjectName?: string | null;
  forkedFromAuthorName?: string | null;
};

export default function AppGrid({
  workspaceId,
}: {
  /**
   * Optional Workspace context for share PATCH / permission (c).
   * My bots omits this; Workspace hub (task 6.2) can pass it when reusing share UI.
   */
  workspaceId?: string;
} = {}) {
  const router = useRouter();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AppSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [shareTarget, setShareTarget] = useState<AppSummary | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [projectShareVisibility, setProjectShareVisibility] = useState<
    "private" | "public"
  >("private");
  const [shareAuthorName, setShareAuthorName] = useState(false);
  const [communitySubject, setCommunitySubject] = useState("General");
  const [communityTagsInput, setCommunityTagsInput] = useState("");

  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  function getShareUrl(app: AppSummary) {
    if (!app.publishedAt || !appOrigin) return "";
    return `${appOrigin}/chat/${app.publicSlug || app.id}`;
  }

  function getProjectShareUrl(app: AppSummary) {
    if (!app.projectShareSlug || !appOrigin) return "";
    return `${appOrigin}/project/${app.projectShareSlug}`;
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
        if (res.status === 403) {
          throw new Error(
            body?.error ||
              "You do not have permission to delete this bot under Workspace policy."
          );
        }
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

  async function saveProjectSharing(
    app: AppSummary,
    settings?: {
      projectShareVisibility?: "private" | "public";
      shareAuthorName?: boolean;
    }
  ) {
    setShareBusy(true);
    setShareError("");

    try {
      const res = await fetch(`/api/apps/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildEducatorSharePatchBody({
            projectShareVisibility:
              settings?.projectShareVisibility ?? projectShareVisibility,
            shareAuthorName: settings?.shareAuthorName ?? shareAuthorName,
            communitySubject,
            communityTagsInput,
            workspaceId,
          })
        ),
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(
          educatorSharePatchErrorMessage(res.status, body?.error)
        );
      }

      const nextApp: AppSummary = {
        ...app,
        publishedAt: body?.app?.publishedAt || app.publishedAt || null,
        publicSlug: body?.app?.publicSlug || app.publicSlug || null,
        projectShareSlug:
          body?.app?.projectShareSlug || app.projectShareSlug || null,
        projectShareVisibility:
          body?.app?.projectShareVisibility ||
          settings?.projectShareVisibility ||
          app.projectShareVisibility ||
          "private",
        shareAuthorName:
          typeof body?.app?.shareAuthorName === "boolean"
            ? body.app.shareAuthorName
            : typeof settings?.shareAuthorName === "boolean"
              ? settings.shareAuthorName
              : app.shareAuthorName ?? false,
        communitySubject:
          body?.app?.communitySubject || communitySubject || app.communitySubject || null,
        communityTags: body?.app?.communityTags || [],
      };

      setApps((current) =>
        current.map((item) => (item.id === app.id ? { ...item, ...nextApp } : item))
      );
      setShareTarget(nextApp);
    } catch (e: any) {
      setShareError(e?.message || "Failed to prepare share links.");
    } finally {
      setShareBusy(false);
    }
  }

  async function handleShare(app: AppSummary) {
    if (!app.publishedAt) return;
    setShareTarget(app);
    setProjectShareVisibility(app.projectShareVisibility || "private");
    setShareAuthorName(app.shareAuthorName ?? false);
    setCommunitySubject(app.communitySubject || "General");
    setCommunityTagsInput((app.communityTags || []).join(", "));
    await saveProjectSharing(app, {
      projectShareVisibility: app.projectShareVisibility || "private",
      shareAuthorName: app.shareAuthorName ?? false,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">My bots</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
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
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:translate-y-[-1px] hover:border-slate-400 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
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
              onShare={() => void handleShare(app)}
              shareDisabled={!app.publishedAt}
              onDelete={() => {
                setDeleteError("");
                setDeleteTarget(app);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">No bots yet</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
            Create your first bot to start designing prompts, previewing
            behavior, and publishing a chatbot.
          </p>
          <button
            type="button"
            onClick={() => router.push("/create")}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition hover:translate-y-[-1px] hover:from-sky-600 hover:to-sky-700"
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
      <ShareDialog
        open={Boolean(shareTarget)}
        appName={shareTarget?.name || "this bot"}
        loading={shareBusy}
        savingSettings={shareBusy}
        error={shareError}
        projectUrl={shareTarget ? getProjectShareUrl(shareTarget) : ""}
        chatbotUrl={shareTarget ? getShareUrl(shareTarget) : ""}
        chatbotError={
          shareTarget && !shareTarget.publishedAt
            ? "Publish this bot from the editor before sharing its public link."
            : undefined
        }
        projectShareVisibility={projectShareVisibility}
        shareAuthorName={shareAuthorName}
        subject={communitySubject}
        tagsInput={communityTagsInput}
        workspaceId={workspaceId}
        onProjectShareVisibilityChange={setProjectShareVisibility}
        onShareAuthorNameChange={setShareAuthorName}
        onSubjectChange={setCommunitySubject}
        onTagsInputChange={setCommunityTagsInput}
        onSaveProjectSettings={() => {
          if (!shareTarget) return;
          void saveProjectSharing(shareTarget, {
            projectShareVisibility,
            shareAuthorName,
          });
        }}
        onClose={() => {
          if (shareBusy) return;
          setShareError("");
          setShareTarget(null);
        }}
      />
    </div>
  );
}
