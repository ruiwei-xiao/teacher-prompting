"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BuildingPermissions,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";
import {
  BUILDING_PERMISSION_FIELDS,
  buildWorkspaceSettingsPatchBody,
  canDeleteWorkspace,
  canEditWorkspaceSettings,
  parseWorkspaceDeleteResponse,
  parseWorkspacePatchResponse,
} from "@/lib/workspace-ui/settings";

export default function WorkspacePermissionsForm({
  workspaceId,
  initialName,
  initialPermissions,
  role,
}: {
  workspaceId: string;
  initialName: string;
  initialPermissions: BuildingPermissions;
  role: WorkspaceRole;
}) {
  const router = useRouter();
  const canEdit = canEditWorkspaceSettings(role);
  const canDelete = canDeleteWorkspace(role);

  const [name, setName] = useState(initialName);
  const [permissions, setPermissions] =
    useState<BuildingPermissions>(initialPermissions);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!canEdit) return;

    const body = buildWorkspaceSettingsPatchBody({
      name,
      buildingPermissions: permissions,
    });
    if (!body) {
      setError("Enter a workspace name");
      setSuccess("");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseWorkspacePatchResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setName(parsed.workspace.name);
      setPermissions(parsed.workspace.buildingPermissions);
      setSuccess(
        "Settings saved. New building permissions apply to subsequent member actions."
      );
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to update workspace settings"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!canDelete) return;

    setDeleteBusy(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      const parsed = parseWorkspaceDeleteResponse(res.status, json);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      router.push(MY_BOTS_HREF);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete workspace");
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-8">
      {!canEdit ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
          Participants can view this Workspace but cannot change settings.
          Ask an Owner or Facilitator to rename the Workspace or update building
          permissions.
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            Name
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
            Owners and Facilitators can rename this Workspace for all members.
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
            Workspace name
          </span>
          <input
            className="mt-1 h-11 w-full max-w-xl rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || busy || deleteBusy}
            aria-readonly={!canEdit}
          />
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            Building permissions
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
            Toggle collaboration rules for Participants. Changes apply to
            subsequent member actions in this Workspace.
          </p>
        </div>

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
                  disabled={!canEdit || busy || deleteBusy}
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

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
          {success}
        </p>
      ) : null}

      {canEdit ? (
        <div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || deleteBusy || !name.trim()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      ) : null}

      {canDelete ? (
        <section className="space-y-3 border-t border-slate-200 pt-8 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
              Delete Workspace
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              Only the Owner can delete this Workspace. Placed bots remain in My
              bots; memberships, invites, and placements for this Workspace are
              removed.
            </p>
          </div>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy || deleteBusy}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-red-300 px-5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Delete Workspace…
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteBusy}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteBusy ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteBusy}
                className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
