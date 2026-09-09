"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Globe,
  LayoutGrid,
  MessageSquare,
  Plus,
  Presentation,
  Settings,
  Star,
  Users,
} from "lucide-react";
import CreateWorkspaceDialog from "@/components/workspace/CreateWorkspaceDialog";
import { isStarredPath, STARRED_HREF } from "@/lib/star-ui/nav";
import {
  ACTIVITY_HREF,
  isCalibrationPath,
} from "@/lib/calibration-ui/offering";
import { isMySessionsPath, MY_SESSIONS_HREF } from "@/lib/chat-session-ui/nav";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";
import {
  COMMUNITY_HREF,
  isCommunityPath,
  MY_BOTS_HREF,
  parseWorkspacesListResponse,
  workspaceHubHref,
  workspaceIdFromPath,
  workspaceInitials,
  workspaceMarkTone,
} from "@/lib/workspace-ui/nav";
import {
  resolveWorkspaceTab,
  WORKSPACE_TABS,
  workspaceSectionNav,
  workspaceTabHref,
  type WorkspaceTab,
} from "@/lib/workspace-ui/tabs";
import type { Workspace, WorkspaceRole } from "@/lib/workspace-store/types";

function navItemClass(active: boolean, compact: boolean): string {
  const base = compact
    ? "pressable mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150"
    : "pressable flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150";
  if (active) {
    return `${base} bg-sky-100 font-semibold text-sky-900 dark:bg-sky-950/60 dark:text-sky-100`;
  }
  return `${base} text-slate-700 hover-ok:bg-slate-100 dark:text-zinc-300 dark:hover-ok:bg-zinc-800`;
}

function workspaceLabelClass(compact: boolean): string {
  return compact
    ? "mx-auto flex h-10 w-10 items-center justify-center rounded-lg"
    : "flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-slate-900 dark:text-zinc-100";
}

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />;
}

function sectionLabel(tab: WorkspaceTab): string {
  return WORKSPACE_TABS.find((item) => item.id === tab)?.label ?? tab;
}

function sectionIcon(tab: WorkspaceTab) {
  switch (tab) {
    case "bots":
      return <NavIcon icon={LayoutGrid} />;
    case "activity":
      return <NavIcon icon={Activity} />;
    case "members":
      return <NavIcon icon={Users} />;
    case "settings":
      return <NavIcon icon={Settings} />;
  }
}

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tracking-wide ${workspaceMarkTone(name)}`}
    >
      {workspaceInitials(name)}
    </span>
  );
}

export default function WorkspaceSidebar({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const [activeRole, setActiveRole] = useState<WorkspaceRole | null>(null);
  const currentWorkspaceId = workspaceIdFromPath(pathname);

  const onMyBots =
    navReady &&
    (pathname === "/" ||
      pathname === MY_BOTS_HREF ||
      pathname.startsWith("/create"));
  const onCommunity = navReady && isCommunityPath(pathname);
  const onStarred = navReady && isStarredPath(pathname);
  const onMySessions = navReady && isMySessionsPath(pathname);
  const onCalibration = navReady && isCalibrationPath(pathname);

  async function loadWorkspaces() {
    setError("");
    try {
      const res = await fetch("/api/workspaces");
      const body = await res.json().catch(() => ({}));
      const parsed = parseWorkspacesListResponse(res.status, body);
      if (!parsed.ok) {
        setWorkspaces([]);
        setError(parsed.error);
        return;
      }
      setWorkspaces(parsed.workspaces);
    } catch {
      setWorkspaces([]);
      setError("Failed to load workspaces");
    }
  }

  useEffect(() => {
    setNavReady(true);
  }, []);

  useEffect(() => {
    void loadWorkspaces().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) {
      setActiveRole(null);
      return;
    }

    let cancelled = false;
    async function loadRole() {
      try {
        const res = await fetch(`/api/workspaces/${currentWorkspaceId}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseWorkspaceGetResponse(res.status, body);
        setActiveRole(parsed.ok ? parsed.role : null);
      } catch {
        if (!cancelled) setActiveRole(null);
      }
    }

    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId]);

  function handleCreated(workspace: Workspace) {
    setWorkspaces((prev) => {
      if (prev.some((w) => w.id === workspace.id)) return prev;
      return [...prev, workspace];
    });
    onNavigate?.();
    router.push(workspaceHubHref(workspace.id));
  }

  const activeTab =
    currentWorkspaceId && activeRole
      ? resolveWorkspaceTab(pathname, tabParam, currentWorkspaceId, activeRole)
      : null;

  return (
    <div className={compact ? "space-y-1" : "space-y-1 text-slate-700 dark:text-zinc-300"}>
      {compact ? (
        <div
          className="mx-auto mb-2 h-px w-6 bg-slate-200 dark:bg-zinc-700"
          title="Library"
        />
      ) : (
        <div className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
          Library
        </div>
      )}

      <Link
        href={MY_BOTS_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onMyBots, compact)}
        aria-current={onMyBots ? "page" : undefined}
        title="My bots"
      >
        <NavIcon icon={Bot} />
        {compact ? <span className="sr-only">My bots</span> : "My bots"}
      </Link>
      <Link
        href={COMMUNITY_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onCommunity, compact)}
        aria-current={onCommunity ? "page" : undefined}
        title="Community"
      >
        <NavIcon icon={Globe} />
        {compact ? <span className="sr-only">Community</span> : "Community"}
      </Link>
      <Link
        href={STARRED_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onStarred, compact)}
        aria-current={onStarred ? "page" : undefined}
        title="Starred"
      >
        <NavIcon icon={Star} />
        {compact ? <span className="sr-only">Starred</span> : "Starred"}
      </Link>
      <Link
        href={MY_SESSIONS_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onMySessions, compact)}
        aria-current={onMySessions ? "page" : undefined}
        title="My sessions"
      >
        <NavIcon icon={MessageSquare} />
        {compact ? <span className="sr-only">My sessions</span> : "My sessions"}
      </Link>
      <Link
        href={ACTIVITY_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onCalibration, compact)}
        aria-current={onCalibration ? "page" : undefined}
        title="Collaborative activities"
      >
        <NavIcon icon={Presentation} />
        {compact ? (
          <span className="sr-only">Collaborative activities</span>
        ) : (
          "Collaborative activities"
        )}
      </Link>

      {compact ? (
        <div
          className="mx-auto mt-4 mb-2 h-px w-6 bg-slate-200 dark:bg-zinc-700"
          title="Workspaces"
        />
      ) : (
        <div className="mt-5 px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
          Workspaces
        </div>
      )}

      <div className="mt-1 space-y-1">
        {loading && (
          <div className={compact ? "px-1 py-2 text-xs text-slate-500" : "px-2.5 py-2 text-sm text-slate-500 dark:text-zinc-500"}>
            {compact ? "…" : "Loading…"}
          </div>
        )}

        {!loading && error && !compact && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          workspaces.map((workspace) => {
            const href = workspaceHubHref(workspace.id);
            const inWorkspace =
              navReady &&
              (pathname === href || pathname.startsWith(`${href}/`));
            const showSections = inWorkspace && Boolean(activeRole);
            const sections = activeRole ? workspaceSectionNav(activeRole) : [];
            const markAndName = (
              <>
                <WorkspaceMark name={workspace.name} />
                {compact ? (
                  <span className="sr-only">{workspace.name}</span>
                ) : (
                  <span className="min-w-0 truncate">{workspace.name}</span>
                )}
              </>
            );

            return (
              <div key={workspace.id} className="space-y-0.5">
                {inWorkspace ? (
                  <div className={workspaceLabelClass(compact)} title={workspace.name}>
                    {markAndName}
                  </div>
                ) : (
                  <Link
                    href={href}
                    onClick={() => onNavigate?.()}
                    className={navItemClass(false, compact)}
                    title={workspace.name}
                  >
                    {markAndName}
                  </Link>
                )}
                {showSections
                  ? sections.map((tab) => {
                      const sectionHref = workspaceTabHref(workspace.id, tab);
                      const sectionActive = activeTab === tab;
                      const label = sectionLabel(tab);
                      return (
                        <Link
                          key={tab}
                          href={sectionHref}
                          scroll={false}
                          onClick={() => onNavigate?.()}
                          className={`${navItemClass(sectionActive, compact)} ${
                            compact ? "" : "ml-3"
                          }`}
                          aria-current={sectionActive ? "page" : undefined}
                          title={label}
                        >
                          {sectionIcon(tab)}
                          {compact ? (
                            <span className="sr-only">{label}</span>
                          ) : (
                            label
                          )}
                        </Link>
                      );
                    })
                  : null}
              </div>
            );
          })}

        {!loading && !error && workspaces.length === 0 && !compact && (
          <div className="px-2.5 py-2 text-sm text-slate-500 dark:text-zinc-500">
            No workspaces yet. Create one to collaborate.
          </div>
        )}

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={navItemClass(false, compact)}
          title="New workspace"
        >
          <NavIcon icon={Plus} />
          {compact ? <span className="sr-only">New workspace</span> : "New workspace"}
        </button>
      </div>

      <CreateWorkspaceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
