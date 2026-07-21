"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppCard from "@/components/dashboard/AppCard";
import DeleteBotDialog from "@/components/dashboard/DeleteBotDialog";
import ShareDialog from "@/components/dashboard/ShareDialog";
import {
  parseStarsListResponse,
  type EligibleStarSummary,
} from "@/lib/star-ui/stars-response";
import {
  buildEducatorSharePatchBody,
  educatorSharePatchErrorMessage,
} from "@/lib/workspace-api/share-patch-body";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";

type OwnedAppSummary = {
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
};

export default function StarredBotGrid() {
  const router = useRouter();
  const [stars, setStars] = useState<EligibleStarSummary[]>([]);
  const [ownedAppsById, setOwnedAppsById] = useState<
    Record<string, OwnedAppSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starBusyId, setStarBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnedAppSummary | null>(
    null
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [shareTarget, setShareTarget] = useState<OwnedAppSummary | null>(null);
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

  function getShareUrl(app: OwnedAppSummary) {
    if (!app.publishedAt || !appOrigin) return "";
    return `${appOrigin}/chat/${app.publicSlug || app.id}`;
  }

  function getProjectShareUrl(app: OwnedAppSummary) {
    if (!app.projectShareSlug || !appOrigin) return "";
    return `${appOrigin}/project/${app.projectShareSlug}`;
  }

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const [starsRes, appsRes] = await Promise.all([
          fetch("/api/stars"),
          fetch("/api/apps"),
        ]);
        const starsBody = await starsRes.json().catch(() => ({}));
        const appsBody = await appsRes.json().catch(() => ({}));
        const parsed = parseStarsListResponse(starsRes.status, starsBody);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        setStars(parsed.stars);

        const byId: Record<string, OwnedAppSummary> = {};
        if (appsRes.ok && Array.isArray(appsBody?.apps)) {
          for (const app of appsBody.apps as OwnedAppSummary[]) {
            if (app && typeof app.id === "string") {
              byId[app.id] = app;
            }
          }
        }
        setOwnedAppsById(byId);
      } catch (e: unknown) {
        setStars([]);
        setOwnedAppsById({});
        setError(
          e instanceof Error ? e.message : "Failed to load starred bots"
        );
      }
    }

    void load().finally(() => setLoading(false));
  }, []);

  const ownedStarCount = useMemo(
    () => stars.filter((star) => star.owned).length,
    [stars]
  );

  async function handleUnstar(star: EligibleStarSummary) {
    if (starBusyId) return;

    const appId = star.appId;
    setStarBusyId(appId);
    const previous = stars;
    setStars((current) => current.filter((item) => item.appId !== appId));

    try {
      const res = await fetch(`/api/stars/${encodeURIComponent(appId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setStars(previous);
      }
    } catch {
      setStars(previous);
    } finally {
      setStarBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleteBusy(true);
    setDeleteError("");

    try {
      const res = await fetch(`/api/apps/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(
            body?.error ||
              "You do not have permission to delete this bot under Workspace policy."
          );
        }
        throw new Error(body?.error || "Failed to delete bot.");
      }

      setStars((current) =>
        current.filter((item) => item.appId !== deleteTarget.id)
      );
      setOwnedAppsById((current) => {
        const next = { ...current };
        delete next[deleteTarget.id];
        return next;
      });
      setDeleteTarget(null);
    } catch (e: unknown) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to delete bot."
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveProjectSharing(
    app: OwnedAppSummary,
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
          })
        ),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          educatorSharePatchErrorMessage(res.status, body?.error)
        );
      }

      const nextApp: OwnedAppSummary = {
        ...app,
        publishedAt: body?.app?.publishedAt || app.publishedAt || null,
        publicSlug: body?.app?.publicSlug || app.publicSlug || undefined,
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
          body?.app?.communitySubject ||
          communitySubject ||
          app.communitySubject ||
          null,
        communityTags: body?.app?.communityTags || [],
      };

      setOwnedAppsById((current) => ({ ...current, [app.id]: nextApp }));
      setStars((current) =>
        current.map((star) =>
          star.appId === app.id
            ? {
                ...star,
                title: nextApp.name || star.title,
                description: nextApp.description ?? star.description,
              }
            : star
        )
      );
      setShareTarget(nextApp);
    } catch (e: unknown) {
      setShareError(
        e instanceof Error ? e.message : "Failed to prepare share links."
      );
    } finally {
      setShareBusy(false);
    }
  }

  async function handleShare(app: OwnedAppSummary) {
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

  if (loading) {
    return (
      <p className="text-sm text-slate-600 dark:text-zinc-300">
        Loading starred bots…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
          Starred
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
          {stars.length
            ? `You have ${stars.length} starred bot${stars.length === 1 ? "" : "s"}${
                ownedStarCount
                  ? ` (${ownedStarCount} yours)`
                  : ""
              }.`
            : "No eligible starred bots right now."}
        </p>
      </div>

      {stars.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {stars.map((star) => {
            const ownedApp = star.owned ? ownedAppsById[star.appId] : undefined;
            const canManage = Boolean(star.owned && ownedApp);

            return (
              <AppCard
                key={star.appId}
                badge={
                  star.owned
                    ? ownedApp?.publishedAt
                      ? "Published"
                      : "Yours"
                    : "Workspace"
                }
                title={ownedApp?.name || star.title}
                desc={
                  ownedApp?.description ||
                  star.description ||
                  "No description yet. Open this bot to continue."
                }
                meta={
                  ownedApp?.updatedAt
                    ? `Updated ${new Date(ownedApp.updatedAt).toLocaleDateString()}`
                    : star.starredAt
                      ? `Starred ${new Date(star.starredAt).toLocaleDateString()}`
                      : undefined
                }
                ctaLabel={star.owned ? "Open bot" : "Open"}
                onOpen={() => router.push(star.open.href)}
                onShare={
                  canManage ? () => void handleShare(ownedApp!) : undefined
                }
                shareDisabled={canManage ? !ownedApp?.publishedAt : undefined}
                onDelete={
                  canManage
                    ? () => {
                        setDeleteError("");
                        setDeleteTarget(ownedApp!);
                      }
                    : undefined
                }
                starred
                starBusy={starBusyId === star.appId}
                onToggleStar={() => void handleUnstar(star)}
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            No starred bots yet
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
            Starred is empty. Star bots from My bots or from a Workspace bot
            list, then they will show up here.
          </p>
          <button
            type="button"
            onClick={() => router.push(MY_BOTS_HREF)}
            className="pressable mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition-[background-color] duration-200 hover:from-sky-600 hover:to-sky-700"
          >
            Go to My bots
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
