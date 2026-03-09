"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_VARIABILITY,
  MODEL_OPTIONS,
  normalizeVariability,
  toModelSelection,
} from "@/lib/app-store/model-selection";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Settings
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Update app settings
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Changes apply to the editor title, assistant bot, and prompt preview.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              App name
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="Enter app name"
              disabled={loading || saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Model
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
              <label className="block text-sm font-medium text-slate-700">
                Variability
              </label>
              <span className="text-sm text-slate-500">{variability}%</span>
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
            <p className="mt-1 text-xs text-slate-500">
              Lower values are more stable. Higher values are more creative and
              varied.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              API key
            </label>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank to keep the current key"
              disabled={loading || saving}
            />
            <p className="mt-1 text-xs text-slate-500">
              Enter a new key only if you want to replace the stored one.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-slate-500">
              {loading ? "Loading current settings..." : `App: ${appId}`}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
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
