"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import CreateAppForm from "@/components/forms/CreateAppForm";

type GenAIModelOption = {
  value: string;
  label: string;
  hint?: string;
};

export default function CreateAppPage() {
  const router = useRouter();

  const modelOptions: GenAIModelOption[] = useMemo(
    () => [
      { value: "openai:gpt-4o-mini", label: "OpenAI — GPT-4o mini" },
      { value: "openai:gpt-4o", label: "OpenAI — GPT-4o" },
      { value: "anthropic:claude-3-5-sonnet", label: "Anthropic — Claude 3.5 Sonnet" },
      { value: "google:gemini-1.5-pro", label: "Google — Gemini 1.5 Pro" },
    ],
    []
  );

  const [selectedModel, setSelectedModel] = useState<string>(
    modelOptions[0]?.value ?? "openai:gpt-4o-mini"
  );
  const [apiKey, setApiKey] = useState<string>("");

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-gradient-to-br from-rose-50 via-emerald-50 to-pink-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex gap-8">
          <aside className="w-64 shrink-0 hidden md:block">
            <WorkspaceSidebar />
          </aside>

          <section className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl dark:text-zinc-100">
              Create a new App
            </h1>
            <p className="mt-2 text-slate-600 dark:text-zinc-400">
              Apps are the AI-powered experiences you build and share.
            </p>

            <div className="mt-6 max-w-3xl rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                    School-provided GenAI settings
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                    Select the model your district provides and enter the corresponding API key.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="genai-model"
                    className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
                  >
                    Model
                  </label>
                  <select
                    id="genai-model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-700"
                  >
                    {modelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="genai-api-key"
                    className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
                  >
                    API key
                  </label>
                  <input
                    id="genai-api-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste API key…"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-emerald-700"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
                    Stored locally on the server for this prototype. You can rotate or update this later.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 max-w-3xl">
              <CreateAppForm
                onCreate={(id) => router.push(`/app/${id}/tour`)}
                genaiModel={selectedModel}
                genaiApiKey={apiKey}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}