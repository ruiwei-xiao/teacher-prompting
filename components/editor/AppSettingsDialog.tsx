"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_VARIABILITY,
  MODEL_OPTIONS,
  normalizeVariability,
  toModelSelection,
} from "@/lib/app-store/model-selection";
import { resolveAssistedAuthoringMode } from "@/lib/assisted-authoring/resolve";
export default function AppSettingsDialog({
  appId,
  open,
  onClose,
  onSaved,
}: {
  appId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appName, setAppName] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]?.value ?? "");
  const [variability, setVariability] = useState(DEFAULT_VARIABILITY);
  const [apiKey, setApiKey] = useState("");
  const [assistedAuthoringMode, setAssistedAuthoringMode] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;

    async function loadApp() {
      setLoading(true);
      setError("");
      setSuccess("");

      try {
        const res = await fetch(`/api/apps/${appId}`);
        const body = await res.json();

        if (!res.ok || !body?.app) {
          throw new Error(body?.error || "Failed to load app settings");
        }

        setAppName(body.app.name || "");
        setSelectedModel(toModelSelection(body.app.provider, body.app.model));
        setVariability(normalizeVariability(body.app.variability));
        setApiKey("");
        setAssistedAuthoringMode(resolveAssistedAuthoringMode(body.app));
      } catch (e: any) {
        setError(e?.message || "Failed to load app settings");
      } finally {
        setLoading(false);
      }
    }

    void loadApp();
  }, [appId, open]);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: appName,
          genaiModel: selectedModel,
          variability,
          genaiApiKey: apiKey,
          assistedAuthoringMode,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error || "Failed to save settings");
      }

      setApiKey("");
      setSuccess("Settings updated.");
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 dark:bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
              Settings
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-100">
              Update app settings
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              Changes apply to the editor title, assistant bot, and prompt preview.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 transition-[background-color,transform,color] duration-150 ease-out hover:bg-slate-100 active:scale-[0.97] dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
              App name
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="Enter app name"
              disabled={loading || saving}
            />
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              Assisted Authoring Mode
            </div>
            <div
              className="mt-2 flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-slate-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-950/60"
              role="group"
              aria-label="Assisted Authoring Mode"
            >
              <button
                type="button"
                onClick={() => setAssistedAuthoringMode(true)}
                disabled={loading || saving}
                aria-pressed={assistedAuthoringMode}
                className={[
                  "flex-1 rounded-[10px] px-3 py-2 text-sm font-medium",
                  "transition-[color,background-color,box-shadow,transform] duration-150 ease-out",
                  "active:scale-[0.97]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                  "disabled:pointer-events-none disabled:opacity-50",
                  assistedAuthoringMode
                    ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200",
                ].join(" ")}
              >
                On
              </button>
              <button
                type="button"
                onClick={() => setAssistedAuthoringMode(false)}
                disabled={loading || saving}
                aria-pressed={!assistedAuthoringMode}
                className={[
                  "flex-1 rounded-[10px] px-3 py-2 text-sm font-medium",
                  "transition-[color,background-color,box-shadow,transform] duration-150 ease-out",
                  "active:scale-[0.97]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                  "disabled:pointer-events-none disabled:opacity-50",
                  !assistedAuthoringMode
                    ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200",
                ].join(" ")}
              >
                Off
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-500">
              {assistedAuthoringMode ? (
                <>
                  Test cases auto-generate, editing AI replies can revise the
                  prompt, and publish requires every case to pass.
                </>
              ) : (
                <>
                  Write the Final Prompt yourself — best for training. No auto
                  test cases, no prompt rewrite from edits, and no publish gate.
                </>
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
              Model
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={loading || saving}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                Variability
              </label>
              <span className="text-sm text-slate-500 dark:text-zinc-400">{variability}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className="mt-2 w-full"
              value={variability}
              onChange={(e) => setVariability(Number(e.target.value))}
              disabled={loading || saving}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
              Lower values are more stable. Higher values are more creative and
              varied.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
              API key
            </label>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank to keep the current key"
              disabled={loading || saving}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
              Enter a new key only if you want to replace the stored one.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {success}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-zinc-700">
            <div className="text-xs text-slate-500 dark:text-zinc-500">
              {loading ? "Loading current settings..." : `App: ${appId}`}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 transition-[background-color,transform] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-sky-700 active:scale-[0.97] disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400"
                disabled={loading || saving}
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
