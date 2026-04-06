"use client";

import { useMemo, useState } from "react";

export default function DeleteBotDialog({
  botName,
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  botName: string;
  open: boolean;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [value, setValue] = useState("");
  const confirmationText = useMemo(() => `delete ${botName}`, [botName]);

  if (!open) return null;

  const canDelete = value.trim() === confirmationText;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 dark:bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
              Delete bot
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-100">
              Delete {botName}?
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              This cannot be undone. Type <strong>{confirmationText}</strong> to
              confirm.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <input
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-zinc-600 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={confirmationText}
            disabled={busy}
          />

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canDelete || busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Deleting..." : "Delete bot"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
