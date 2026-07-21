"use client";

import { useState } from "react";
import {
  buildCreateWorkspaceBody,
  parseCreateWorkspaceResponse,
} from "@/lib/workspace-ui/nav";
import type { Workspace } from "@/lib/workspace-store/types";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submitting = busyProp || busy;
  const canSubmit = Boolean(name.trim()) && !submitting;

  async function handleCreate() {
    const body = buildCreateWorkspaceBody(name);
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
      setName("");
      onCreated(parsed.workspace);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 dark:bg-black/50">
      <div
        role="dialog"
        aria-labelledby="create-workspace-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-sky-600 dark:text-sky-400">
              New workspace
            </div>
            <h2
              id="create-workspace-title"
              className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-100"
            >
              Create a Workspace
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              Name a course, cohort, or team space. You will be the Owner.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            disabled={submitting}
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-zinc-800">
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
          </div>
        </div>
      </div>
    </div>
  );
}
