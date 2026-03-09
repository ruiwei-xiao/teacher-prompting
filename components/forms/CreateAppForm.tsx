"use client";

import { useState } from "react";

export default function CreateAppForm({
  onCreate,
  genaiModel,
  genaiApiKey,
}: {
  onCreate: (id: string) => void;
  genaiModel: string;
  genaiApiKey: string;
}) {
  const [name, setName] = useState("PEDAGOGICAL-PROMPTING");
  const [desc, setDesc] = useState("Support for course learning objectives");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!genaiApiKey.trim()) {
      setError("Please enter an API key.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: desc,
          genaiModel,
          genaiApiKey,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error || "Failed to create app");
      }

      onCreate(body.app.id);
    } catch (e: any) {
      setError(e?.message || "Failed to create app");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">App Name</label>
        <input
          className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My awesome app"
        />
        <p className="mt-1 text-xs text-slate-500">You can change this later if needed.</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">App Description</label>
        <textarea
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white p-3"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What does your app do?"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white h-11 px-5 disabled:opacity-50"
      >
        {busy ? "Creating..." : "Create App"}
      </button>
    </form>
  );
}