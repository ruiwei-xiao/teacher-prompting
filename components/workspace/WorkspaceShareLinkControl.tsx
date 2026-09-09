"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceInviteRole } from "@/lib/workspace-store/types";
import { invitesApiHref } from "@/lib/workspace-ui/invites";
import {
  SHARE_LINK_ROLES,
  buildResetShareLinkBody,
  isShareLinkRole,
  parseResetShareLinkResponse,
  parseShareLinkListResponse,
  replaceShownShareLink,
  shareLinkUrlForRole,
  toShareLinkClipboardText,
  type ShareLinkByRole,
} from "@/lib/workspace-ui/share-link";

function roleLabel(role: WorkspaceInviteRole): string {
  return role === "facilitator" ? "Facilitator" : "Participant";
}

export default function WorkspaceShareLinkControl({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [linkByRole, setLinkByRole] = useState<ShareLinkByRole | null>(null);
  const [role, setRole] = useState<WorkspaceInviteRole>("participant");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const origin =
    typeof window === "undefined" ? undefined : window.location.origin;

  const shownUrl = useMemo(() => {
    if (!linkByRole) return "";
    return shareLinkUrlForRole(linkByRole, role, origin);
  }, [linkByRole, role, origin]);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      setError("Missing workspace id");
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(invitesApiHref(workspaceId));
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseShareLinkListResponse(res.status, body);
        if (!parsed.ok) {
          setError(parsed.error);
          setLinkByRole(null);
          return;
        }
        setLinkByRole(parsed.linkByRole);
      } catch {
        if (!cancelled) {
          setError("Failed to load invitation links");
          setLinkByRole(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function copyShownUrl(): Promise<void> {
    if (!shownUrl || busy) return;
    const clipboardText = toShareLinkClipboardText(shownUrl, origin);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clipboardText);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setActionSuccess(`Invite link copied: ${clipboardText}`);
      setActionError("");
    } catch {
      setActionError(
        `Could not copy automatically. Link: ${clipboardText || shownUrl}`
      );
      setActionSuccess("");
    }
  }

  async function resetShownLink(): Promise<void> {
    if (!linkByRole || busy) return;
    setBusy(true);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(invitesApiHref(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildResetShareLinkBody(role)),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseResetShareLinkResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setLinkByRole((current) =>
        current ? replaceShownShareLink(current, parsed.invite) : current
      );
      const nextUrl = shareLinkUrlForRole(
        replaceShownShareLink(linkByRole, parsed.invite),
        role,
        origin
      );
      setActionSuccess(`Invitation link reset. New URL: ${nextUrl}`);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to reset invitation link"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
        Invitation link
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
            Role on join
          </span>
          <select
            className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            value={role}
            onChange={(e) => {
              if (isShareLinkRole(e.target.value)) {
                setRole(e.target.value);
              }
            }}
            disabled={busy || loading}
          >
            {SHARE_LINK_ROLES.map((option) => (
              <option key={option} value={option}>
                {roleLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          Loading invitation link…
        </p>
      ) : error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 basis-64">
            <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              Current URL ({roleLabel(role)})
            </span>
            <input
              readOnly
              className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={shownUrl}
            />
          </label>
          <button
            type="button"
            onClick={() => void copyShownUrl()}
            disabled={busy || !shownUrl}
            className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => void resetShownLink()}
            disabled={busy || !linkByRole}
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busy ? "Resetting…" : "Reset link"}
          </button>
        </div>
      )}
      {actionError ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionSuccess ? (
        <p
          className="text-sm text-emerald-700 dark:text-emerald-300"
          role="status"
        >
          {actionSuccess}
        </p>
      ) : null}
    </div>
  );
}
