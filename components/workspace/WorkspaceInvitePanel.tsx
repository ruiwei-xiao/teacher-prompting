"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  WorkspaceInvite,
  WorkspaceInviteRole,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import {
  buildCreateEmailInviteBody,
  buildCreateLinkInviteBody,
  buildRevokeInviteBody,
  canManageInvites,
  emailInviteRecordedMessage,
  filterActiveInvites,
  inviteUrlForToken,
  invitesApiHref,
  parseCreateInviteResponse,
  parseInvitesListResponse,
  parseRevokeInviteResponse,
  type InviteRole,
} from "@/lib/workspace-ui/invites";

function roleLabel(role: WorkspaceInviteRole): string {
  return role === "facilitator" ? "Facilitator" : "Participant";
}

function absoluteInviteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}

export default function WorkspaceInvitePanel({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: WorkspaceRole;
}) {
  const manage = canManageInvites(role);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(manage);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailRole, setEmailRole] = useState<InviteRole>("participant");
  const [linkRole, setLinkRole] = useState<InviteRole>("participant");
  const [lastCopiedUrl, setLastCopiedUrl] = useState("");

  async function loadInvites() {
    if (!manage) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(invitesApiHref(workspaceId));
      const body = await res.json().catch(() => ({}));
      const parsed = parseInvitesListResponse(res.status, body);
      if (!parsed.ok) {
        setError(parsed.error);
        setInvites([]);
        return;
      }
      setInvites(parsed.invites);
    } catch {
      setError("Failed to load invites");
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!workspaceId || !manage) {
      setLoading(false);
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
        const parsed = parseInvitesListResponse(res.status, body);
        if (!parsed.ok) {
          setError(parsed.error);
          setInvites([]);
          return;
        }
        setInvites(parsed.invites);
      } catch {
        if (!cancelled) {
          setError("Failed to load invites");
          setInvites([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, manage]);

  const activeInvites = useMemo(() => filterActiveInvites(invites), [invites]);

  async function copyInviteLink(urlPath: string): Promise<boolean> {
    const absolute = absoluteInviteUrl(urlPath);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absolute);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setLastCopiedUrl(absolute);
      setActionSuccess(`Invite link copied: ${absolute}`);
      setActionError("");
      return true;
    } catch {
      setLastCopiedUrl(absolute);
      setActionError(
        `Could not copy automatically. Link: ${absolute || urlPath}`,
      );
      setActionSuccess("");
      return false;
    }
  }

  async function handleCreateEmail(e: FormEvent) {
    e.preventDefault();
    if (!manage || busy) return;
    const body = buildCreateEmailInviteBody(email, emailRole);
    if (!body) {
      setActionError("Enter an email address to record an invite.");
      setActionSuccess("");
      return;
    }

    setBusy(true);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(invitesApiHref(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseCreateInviteResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setEmail("");
      setActionSuccess(emailInviteRecordedMessage(body.email));
      await loadInvites();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to record email invite",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateLink(e: FormEvent) {
    e.preventDefault();
    if (!manage || busy) return;

    setBusy(true);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(invitesApiHref(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateLinkInviteBody(linkRole)),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseCreateInviteResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const urlPath =
        parsed.inviteUrl ?? inviteUrlForToken(parsed.invite.token);
      await loadInvites();
      const copied = await copyInviteLink(urlPath);
      if (copied) {
        setActionSuccess(
          `Invite link created and copied (${roleLabel(linkRole)}). Share it with your cohort.`,
        );
      }
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create invite link",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(invite: WorkspaceInvite) {
    if (!manage || busyInviteId) return;
    setBusyInviteId(invite.id);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(invitesApiHref(workspaceId), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRevokeInviteBody(invite.id)),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseRevokeInviteResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setActionSuccess(
        invite.kind === "link"
          ? "Invite link revoked. New joins through that link will be rejected."
          : "Email invite revoked.",
      );
      await loadInvites();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to revoke invite",
      );
    } finally {
      setBusyInviteId(null);
    }
  }

  if (!manage) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Invites
        </h2>
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          Only Owners and Facilitators can create or revoke Workspace invites.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Invites
        </h2>
      </div>

      <form
        onSubmit={(e) => void handleCreateEmail(e)}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
          Record email invite
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[14rem] flex-1">
            <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              Email
            </span>
            <input
              type="email"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="educator@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              Role
            </span>
            <select
              className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={emailRole}
              onChange={(e) => setEmailRole(e.target.value as InviteRole)}
              disabled={busy}
            >
              <option value="participant">Participant</option>
              <option value="facilitator">Facilitator</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Recording…" : "Record invite"}
          </button>
        </div>
      </form>

      <form
        onSubmit={(e) => void handleCreateLink(e)}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
          Create invite link
        </h3>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Copy a link so many educators can join during a short window without
          one-by-one account provisioning.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              Role on join
            </span>
            <select
              className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={linkRole}
              onChange={(e) => setLinkRole(e.target.value as InviteRole)}
              disabled={busy}
            >
              <option value="participant">Participant</option>
              <option value="facilitator">Facilitator</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create & copy link"}
          </button>
        </div>
        {lastCopiedUrl ? (
          <p className="break-all text-xs text-slate-500 dark:text-zinc-400">
            Last copied: {lastCopiedUrl}
          </p>
        ) : null}
      </form>

      {loading ? (
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          Loading invites…
        </p>
      ) : error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
            Active invites
          </h3>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/40">
            {activeInvites.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-600 dark:text-zinc-400">
                No active invites yet.
              </li>
            ) : (
              activeInvites.map((invite) => {
                const urlPath = inviteUrlForToken(invite.token);
                const revoking = busyInviteId === invite.id;
                return (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                        {invite.kind === "email"
                          ? `Email · ${invite.email ?? "(missing)"}`
                          : "Invite link"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                        Role: {roleLabel(invite.role)}
                        {invite.expiresAt
                          ? ` · Expires ${new Date(invite.expiresAt).toLocaleString()}`
                          : null}
                      </p>
                      {invite.kind === "link" ? (
                        <p className="mt-1 break-all text-xs text-slate-500 dark:text-zinc-400">
                          {urlPath}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {invite.kind === "link" ? (
                        <button
                          type="button"
                          onClick={() => void copyInviteLink(urlPath)}
                          disabled={revoking || busy}
                          className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Copy link
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleRevoke(invite)}
                        disabled={revoking || busy}
                        className="inline-flex h-9 items-center rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        {revoking ? "Revoking…" : "Revoke"}
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
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
