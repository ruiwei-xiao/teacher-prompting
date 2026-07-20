"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildEducatorSharePatchBody,
  educatorSharePatchErrorMessage,
} from "@/lib/workspace-api/share-patch-body";
import type {
  BuildingPermissions,
  WorkspacePlacement,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import {
  canPlaceIntoWorkspace,
  canUnplaceFromWorkspace,
  filterVisiblePlacements,
  listPlaceableOwnedBots,
  parsePlacementsListResponse,
  type HubBotSummary,
} from "@/lib/workspace-ui/hub";
import { peerBotPreviewHref } from "@/lib/workspace-ui/peer-preview";
import ShareDialog from "@/components/dashboard/ShareDialog";

type GridBot = HubBotSummary & {
  isOwned: boolean;
};

export default function WorkspaceBotGrid({
  workspaceId,
  role,
  permissions,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  permissions: BuildingPermissions;
}) {
  const router = useRouter();
  const [placements, setPlacements] = useState<WorkspacePlacement[]>([]);
  const [ownedBots, setOwnedBots] = useState<HubBotSummary[]>([]);
  const [botById, setBotById] = useState<Record<string, HubBotSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAppId, setBusyAppId] = useState<string | null>(null);
  const [placeSelect, setPlaceSelect] = useState("");
  const [actionError, setActionError] = useState("");

  const [shareTarget, setShareTarget] = useState<HubBotSummary | null>(null);
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

  const ownedAppIds = useMemo(
    () => new Set(ownedBots.map((b) => b.id)),
    [ownedBots]
  );

  const visiblePlacements = useMemo(
    () =>
      filterVisiblePlacements({
        placements,
        role,
        permissions,
        ownedAppIds,
      }),
    [placements, role, permissions, ownedAppIds]
  );

  const placedAppIds = useMemo(
    () => new Set(placements.map((p) => p.appId)),
    [placements]
  );

  const placeable = useMemo(
    () =>
      listPlaceableOwnedBots({
        ownedBots,
        placedAppIds,
      }),
    [ownedBots, placedAppIds]
  );

  const canPlace = canPlaceIntoWorkspace({ role, permissions });

  const load = useCallback(async () => {
    setError("");
    try {
      const [placementsRes, appsRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/placements`),
        fetch("/api/apps"),
      ]);

      const placementsBody = await placementsRes.json().catch(() => ({}));
      const parsed = parsePlacementsListResponse(
        placementsRes.status,
        placementsBody
      );
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const appsBody = await appsRes.json().catch(() => ({}));
      const owned: HubBotSummary[] =
        appsRes.ok && Array.isArray(appsBody?.apps)
          ? (appsBody.apps as HubBotSummary[])
          : [];

      const ownedMap: Record<string, HubBotSummary> = {};
      for (const app of owned) {
        ownedMap[app.id] = app;
      }

      const peerIds = parsed.placements
        .map((p) => p.appId)
        .filter((id) => !ownedMap[id]);

      const peerEntries = await Promise.all(
        peerIds.map(async (appId) => {
          try {
            const res = await fetch(
              `/api/workspaces/${workspaceId}/bots/${appId}`
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.app) return null;
            const app = body.app as HubBotSummary;
            return [appId, app] as const;
          } catch {
            return null;
          }
        })
      );

      const nextBotById: Record<string, HubBotSummary> = { ...ownedMap };
      for (const entry of peerEntries) {
        if (entry) nextBotById[entry[0]] = entry[1];
      }

      setPlacements(parsed.placements);
      setOwnedBots(owned);
      setBotById(nextBotById);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load workspace bots");
      setPlacements([]);
      setOwnedBots([]);
      setBotById({});
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const gridBots: GridBot[] = visiblePlacements.map((p) => {
    const summary = botById[p.appId];
    const isOwned = ownedAppIds.has(p.appId);
    return {
      id: p.appId,
      name: summary?.name || `Bot ${p.appId.slice(0, 8)}`,
      description: summary?.description,
      updatedAt: summary?.updatedAt,
      publishedAt: summary?.publishedAt,
      publicSlug: summary?.publicSlug,
      projectShareSlug: summary?.projectShareSlug,
      projectShareVisibility: summary?.projectShareVisibility,
      shareAuthorName: summary?.shareAuthorName,
      communitySubject: summary?.communitySubject,
      communityTags: summary?.communityTags,
      isOwned,
    };
  });

  async function handlePlace() {
    if (!placeSelect || !canPlace) return;
    setBusyAppId(placeSelect);
    setActionError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/placements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: placeSelect }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Failed to place bot"
        );
      }
      setPlaceSelect("");
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to place bot");
    } finally {
      setBusyAppId(null);
    }
  }

  async function handleUnplace(appId: string) {
    setBusyAppId(appId);
    setActionError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/placements`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Failed to remove placement"
        );
      }
      await load();
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Failed to remove placement"
      );
    } finally {
      setBusyAppId(null);
    }
  }

  function getShareUrl(app: HubBotSummary) {
    if (!app.publishedAt || !appOrigin) return "";
    return `${appOrigin}/chat/${app.publicSlug || app.id}`;
  }

  function getProjectShareUrl(app: HubBotSummary) {
    if (!app.projectShareSlug || !appOrigin) return "";
    return `${appOrigin}/project/${app.projectShareSlug}`;
  }

  async function saveProjectSharing(
    app: HubBotSummary,
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          educatorSharePatchErrorMessage(res.status, body?.error)
        );
      }
      const nextApp: HubBotSummary = {
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
          body?.app?.communitySubject ||
          communitySubject ||
          app.communitySubject ||
          null,
        communityTags: body?.app?.communityTags || [],
      };
      setBotById((current) => ({ ...current, [app.id]: nextApp }));
      setOwnedBots((current) =>
        current.map((item) => (item.id === app.id ? { ...item, ...nextApp } : item))
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

  async function handleShare(app: HubBotSummary) {
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
        Loading workspace bots…
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
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
          Workspace bots
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
          Bots placed in this Workspace — separate from your personal My bots
          list.
          {loading
            ? ""
            : gridBots.length
              ? ` Showing ${gridBots.length} bot${gridBots.length === 1 ? "" : "s"}.`
              : " No bots are visible here yet."}
        </p>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {actionError}
        </div>
      )}

      {canPlace && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Place a bot from My bots
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
            Placement keeps personal ownership. Remove it later without deleting
            the bot.
          </p>
          {placeable.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">
              All of your bots are already placed here, or you have no bots yet.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="h-11 min-w-[12rem] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                value={placeSelect}
                onChange={(e) => setPlaceSelect(e.target.value)}
                disabled={Boolean(busyAppId)}
              >
                <option value="">Select a bot…</option>
                {placeable.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handlePlace()}
                disabled={!placeSelect || Boolean(busyAppId)}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-sky-600 px-5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busyAppId && busyAppId === placeSelect
                  ? "Placing…"
                  : "Place in Workspace"}
              </button>
            </div>
          )}
        </div>
      )}

      {gridBots.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {gridBots.map((bot) => {
            const canUnplace = canUnplaceFromWorkspace({
              role,
              permissions,
              isBotOwner: bot.isOwned,
            });
            return (
              <div
                key={bot.id}
                className="flex h-full flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-zinc-500/80 dark:bg-zinc-800"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-200">
                    {bot.isOwned ? "Yours" : "Peer"}
                  </span>
                  {bot.updatedAt && (
                    <span>
                      Updated {new Date(bot.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-zinc-100">
                  {bot.name}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-zinc-300">
                  {bot.description ||
                    (bot.isOwned
                      ? "No description yet."
                      : "Placed by another member.")}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5 dark:border-zinc-600/60">
                  {bot.isOwned ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/app/${bot.id}/editor`)}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white"
                    >
                      Open bot
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(peerBotPreviewHref(workspaceId, bot.id))
                      }
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white"
                    >
                      Inspect
                    </button>
                  )}
                  {bot.isOwned && (
                    <button
                      type="button"
                      onClick={() => void handleShare(bot)}
                      disabled={!bot.publishedAt}
                      title={
                        !bot.publishedAt
                          ? "Publish this bot before sharing."
                          : undefined
                      }
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-zinc-500/70 dark:bg-zinc-900/85 dark:text-zinc-100"
                    >
                      Share
                    </button>
                  )}
                  {canUnplace && (
                    <button
                      type="button"
                      onClick={() => void handleUnplace(bot.id)}
                      disabled={busyAppId === bot.id}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/40 px-5 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                    >
                      {busyAppId === bot.id ? "Removing…" : "Remove from Workspace"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            No workspace bots yet
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
            {canPlace
              ? "Place a bot from My bots above to share it with this Workspace."
              : "Placed bots you are allowed to see will appear here."}
          </p>
        </div>
      )}

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
