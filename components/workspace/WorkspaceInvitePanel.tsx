"use client";

import { useState, type FormEvent } from "react";
import type { WorkspaceRole } from "@/lib/workspace-store/types";
import {
  buildCreateEmailInviteBody,
  canManageInvites,
  emailInviteRecordedMessage,
  invitesApiHref,
  parseCreateInviteResponse,
  type InviteRole,
} from "@/lib/workspace-ui/invites";
import WorkspaceShareLinkControl from "./WorkspaceShareLinkControl";

export default function WorkspaceInvitePanel({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: WorkspaceRole;
}) {
  const manage = canManageInvites(role);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [emailRole, setEmailRole] = useState<InviteRole>("participant");

  async function handleCreateEmail(e: FormEvent) {
    e.preventDefault();
    if (!manage || busy) return;
    const body = buildCreateEmailInviteBody(email, emailRole);
    if (!body) {
      setError("Enter an email address to record an invite.");
      setSuccess("");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
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
      setSuccess(emailInviteRecordedMessage(body.email));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to record email invite"
      );
    } finally {
      setBusy(false);
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

      <WorkspaceShareLinkControl workspaceId={workspaceId} />

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="text-sm text-emerald-700 dark:text-emerald-300"
          role="status"
        >
          {success}
        </p>
      ) : null}
    </div>
  );
}
