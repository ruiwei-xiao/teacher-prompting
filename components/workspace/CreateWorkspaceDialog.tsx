"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  buildCreateEmailInviteBody,
  emailInviteRecordedMessage,
  invitesApiHref,
  parseCreateInviteResponse,
  type InviteRole,
} from "@/lib/workspace-ui/invites";
import {
  buildCreateWorkspaceBody,
  DEFAULT_CREATE_BUILDING_PERMISSIONS,
  parseCreateWorkspaceResponse,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceNameError,
} from "@/lib/workspace-ui/nav";
import { BUILDING_PERMISSION_FIELDS } from "@/lib/workspace-ui/settings";
import type {
  BuildingPermissions,
  Workspace,
} from "@/lib/workspace-store/types";
import WorkspaceRoleHintGroup from "./WorkspaceRoleHintGroup";
import WorkspaceShareLinkControl from "./WorkspaceShareLinkControl";

type Phase = "create" | "invite";

export default function CreateWorkspaceDialog({
  open,
  busy: busyProp,
  onClose,
  onCreated,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<BuildingPermissions>({
    ...DEFAULT_CREATE_BUILDING_PERMISSIONS,
  });
  const [phase, setPhase] = useState<Phase>("create");
  const [created, setCreated] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("participant");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) return;
    setName("");
    setPermissions({ ...DEFAULT_CREATE_BUILDING_PERMISSIONS });
    setPhase("create");
    setCreated(null);
    setBusy(false);
    setError("");
    setInviteEmail("");
    setInviteRole("participant");
    setInviteBusy(false);
    setInviteError("");
    setInviteSuccess("");
  }, [open]);

  if (!open || !mounted || typeof document === "undefined") return null;

  const submitting = busyProp || busy;
  const nameIssue = workspaceNameError(name);
  const canSubmit = !nameIssue && !submitting;

  function finish(workspace: Workspace) {
    onCreated(workspace);
    onClose();
  }

  function handleDismiss() {
    if (submitting) return;
    if (phase === "invite" && created) {
      finish(created);
      return;
    }
    onClose();
  }

  async function handleCreate() {
    if (nameIssue) {
      setError(nameIssue);
      return;
    }
    const body = buildCreateWorkspaceBody(name, permissions);
    if (!body) {
      setError("Enter a workspace name");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseCreateWorkspaceResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setCreated(parsed.workspace);
      setPhase("invite");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateEmail(e: FormEvent) {
    e.preventDefault();
    if (!created || inviteBusy) return;
    const body = buildCreateEmailInviteBody(inviteEmail, inviteRole);
    if (!body) {
      setInviteError("Enter an email address to record an invite.");
      setInviteSuccess("");
      return;
    }

    setInviteBusy(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      const res = await fetch(invitesApiHref(created.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseCreateInviteResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setInviteEmail("");
      setInviteSuccess(emailInviteRecordedMessage(body.email));
    } catch (err: unknown) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to record email invite"
      );
    } finally {
      setInviteBusy(false);
    }
  }

  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 dark:bg-black/50">
      <div
        role="dialog"
        aria-labelledby="create-workspace-title"
        className="flex max-h-[min(44rem,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-sky-600 dark:text-sky-400">
              New workspace
            </div>
            <h2
              id="create-workspace-title"
              className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-100"
            >
              {phase === "invite"
                ? "Invite people (optional)"
                : "Create a Workspace"}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              {phase === "invite"
                ? "You are the Owner. Invite by email or share a link, or skip and open the Workspace."
                : "Name a course, cohort, or team space. You will be the Owner."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            disabled={submitting}
          >
            Close
          </button>
        </div>

        {phase === "create" ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                Workspace name
              </span>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Period 3 Algebra"
                disabled={submitting}
                autoFocus
                aria-invalid={Boolean(name.trim() && nameIssue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <span className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-500">
                <span>
                  {name.trim() && nameIssue ? (
                    <span className="text-red-700 dark:text-red-300" role="alert">
                      {nameIssue}
                    </span>
                  ) : (
                    `Up to ${WORKSPACE_NAME_MAX_LENGTH} characters`
                  )}
                </span>
                <span>
                  {name.trim().length}/{WORKSPACE_NAME_MAX_LENGTH}
                </span>
              </span>
            </label>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Building permissions
              </h3>
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                All start off. You can change these later in Settings.
              </p>
              <ul className="space-y-3">
                {BUILDING_PERMISSION_FIELDS.map((field) => (
                  <li key={field.key}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed"
                        checked={permissions[field.key]}
                        onChange={(e) =>
                          setPermissions((prev) => ({
                            ...prev,
                            [field.key]: e.target.checked,
                          }))
                        }
                        disabled={submitting}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 dark:text-zinc-100">
                          ({field.letter}) {field.label}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-600 dark:text-zinc-400">
                          {field.description}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                {error}
              </div>
            )}
          </div>
        ) : created ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <WorkspaceRoleHintGroup />
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
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={inviteBusy}
                    autoComplete="email"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                    Role
                  </span>
                  <select
                    className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as InviteRole)
                    }
                    disabled={inviteBusy}
                  >
                    <option value="participant">Participant</option>
                    <option value="facilitator">Facilitator</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={inviteBusy}
                  className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteBusy ? "Recording…" : "Record invite"}
                </button>
              </div>
              {inviteError ? (
                <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                  {inviteError}
                </p>
              ) : null}
              {inviteSuccess ? (
                <p
                  className="text-sm text-emerald-700 dark:text-emerald-300"
                  role="status"
                >
                  {inviteSuccess}
                </p>
              ) : null}
            </form>

            <WorkspaceShareLinkControl workspaceId={created.id} />
          </div>
        ) : null}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-zinc-800">
          {phase === "create" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canSubmit}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Workspace"}
              </button>
            </>
          ) : created ? (
            <>
              <button
                type="button"
                onClick={() => finish(created)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Skip invite
              </button>
              <button
                type="button"
                onClick={() => finish(created)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
              >
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
