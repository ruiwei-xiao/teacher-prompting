"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import CreateWorkspaceDialog from "@/components/workspace/CreateWorkspaceDialog";
import { isStarredPath, STARRED_HREF } from "@/lib/star-ui/nav";
import {
  ACTIVITY_HREF,
  isCalibrationPath,
} from "@/lib/calibration-ui/offering";
import { isMySessionsPath, MY_SESSIONS_HREF } from "@/lib/chat-session-ui/nav";
import {
  MY_BOTS_HREF,
  parseWorkspacesListResponse,
  workspaceHubHref,
} from "@/lib/workspace-ui/nav";
import type { Workspace } from "@/lib/workspace-store/types";

function navItemClass(active: boolean): string {
  const base =
    "pressable block w-full rounded-lg px-3.5 py-2 text-left transition-colors duration-150";
  if (active) {
    return `${base} bg-sky-100 font-semibold text-sky-900 dark:bg-sky-950/60 dark:text-sky-100`;
  }
  return `${base} text-slate-700 hover-ok:bg-slate-100 dark:text-zinc-300 dark:hover-ok:bg-zinc-800`;
}

export default function WorkspaceSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Path-based active styles must wait until mount so SSR HTML matches the
  // first client render (usePathname can disagree across the boundary).
  const [navReady, setNavReady] = useState(false);
  const onMyBots =
    navReady &&
    (pathname === "/" ||
      pathname === MY_BOTS_HREF ||
      pathname.startsWith("/create"));
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

  function handleCreated(workspace: Workspace) {
    setWorkspaces((prev) => {
      if (prev.some((w) => w.id === workspace.id)) return prev;
      return [...prev, workspace];
    });
    onNavigate?.();
    router.push(workspaceHubHref(workspace.id));
  }

  return (
    <div className="space-y-1 text-slate-700 dark:text-zinc-300">
      <div className="mb-2 font-semibold text-slate-900 dark:text-zinc-100">
        Library
      </div>
      <Link
        href={MY_BOTS_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onMyBots)}
        aria-current={onMyBots ? "page" : undefined}
      >
        My bots
      </Link>
      <Link
        href={STARRED_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onStarred)}
        aria-current={onStarred ? "page" : undefined}
      >
        Starred
      </Link>
      <Link
        href={MY_SESSIONS_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onMySessions)}
        aria-current={onMySessions ? "page" : undefined}
      >
        My sessions
      </Link>
      <Link
        href={ACTIVITY_HREF}
        onClick={() => onNavigate?.()}
        className={navItemClass(onCalibration)}
        aria-current={onCalibration ? "page" : undefined}
      >
        Collaborative activities
      </Link>

      <div className="mt-6 text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500">
        Workspaces
      </div>

      <div className="mt-2 space-y-1">
        {loading && (
          <div className="px-3.5 py-2 text-sm text-slate-500 dark:text-zinc-500">
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          workspaces.map((workspace) => {
            const href = workspaceHubHref(workspace.id);
            const active =
              navReady &&
              (pathname === href || pathname.startsWith(`${href}/`));
            return (
              <Link
                key={workspace.id}
                href={href}
                onClick={() => onNavigate?.()}
                className={navItemClass(active)}
                aria-current={active ? "page" : undefined}
              >
                {workspace.name}
              </Link>
            );
          })}

        {!loading && !error && workspaces.length === 0 && (
          <div className="px-3.5 py-2 text-sm text-slate-500 dark:text-zinc-500">
            No workspaces yet. Create one to collaborate.
          </div>
        )}

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="pressable mt-2 w-full rounded-lg px-3.5 py-2 text-left hover-ok:bg-slate-100 dark:hover-ok:bg-zinc-800"
        >
          + New workspace
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
