"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell/AppShell";
import CreateAppForm from "@/components/forms/CreateAppForm";
import {
  PERSONAL_CREATE_TARGET_VALUE,
  listAllowedCreateIntoWorkspaceTargets,
  resolveInitialCreateWorkspaceId,
  type CreateIntoWorkspaceTarget,
} from "@/lib/workspace-ui/create";
import { parseWorkspacesListResponse } from "@/lib/workspace-ui/nav";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";

type GenAIModelOption = {
  value: string;
  label: string;
  hint?: string;
};

function readQueryWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("workspaceId");
  return value && value.trim() ? value.trim() : null;
}

export default function CreateAppPage() {
  const router = useRouter();

  const modelOptions: GenAIModelOption[] = useMemo(
    () => [
      { value: "openai:gpt-5.4-mini", label: "OpenAI — GPT-5.4 mini" },
      { value: "openai:gpt-5.4", label: "OpenAI — GPT-5.4" },
      { value: "anthropic:claude-sonnet-4-6", label: "Anthropic — Claude Sonnet 4.6" },
      { value: "anthropic:claude-opus-4-6", label: "Anthropic — Claude Opus 4.6" },
      { value: "google:gemini-2.5-flash", label: "Google — Gemini 2.5 Flash" },
      { value: "google:gemini-2.5-pro", label: "Google — Gemini 2.5 Pro" },
      {
        value: "google:gemini-3.1-flash-lite-preview",
        label: "Google — Gemini 3.1 Flash-Lite (preview)",
      },
      { value: "google:gemini-3-flash-preview", label: "Google — Gemini 3 Flash (preview)" },
      { value: "google:gemini-3.1-pro-preview", label: "Google — Gemini 3.1 Pro (preview)" },
    ],
    []
  );

  const [selectedModel, setSelectedModel] = useState<string>(
    modelOptions[0]?.value ?? "openai:gpt-5.4-mini"
  );
  const [apiKey, setApiKey] = useState<string>("");
  const [allowedTargets, setAllowedTargets] = useState<
    CreateIntoWorkspaceTarget[]
  >([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    PERSONAL_CREATE_TARGET_VALUE
  );
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTargets() {
      setTargetsError("");
      try {
        const listRes = await fetch("/api/workspaces");
        const listBody = await listRes.json().catch(() => ({}));
        const listed = parseWorkspacesListResponse(listRes.status, listBody);
        if (!listed.ok) {
          if (!cancelled) {
            setAllowedTargets([]);
            setTargetsError(listed.error);
          }
          return;
        }

        const candidates: CreateIntoWorkspaceTarget[] = [];
        await Promise.all(
          listed.workspaces.map(async (workspace) => {
            const res = await fetch(`/api/workspaces/${workspace.id}`);
            const body = await res.json().catch(() => ({}));
            const parsed = parseWorkspaceGetResponse(res.status, body);
            if (!parsed.ok) return;
            candidates.push({
              id: parsed.workspace.id,
              name: parsed.workspace.name,
              role: parsed.role,
              buildingPermissions: parsed.workspace.buildingPermissions,
            });
          })
        );

        if (cancelled) return;

        const allowed = listAllowedCreateIntoWorkspaceTargets(candidates);
        setAllowedTargets(allowed);
        setSelectedWorkspaceId(
          resolveInitialCreateWorkspaceId({
            queryWorkspaceId: readQueryWorkspaceId(),
            allowedTargets: allowed,
          })
        );
      } catch {
        if (!cancelled) {
          setAllowedTargets([]);
          setTargetsError("Failed to load workspaces");
        }
      } finally {
        if (!cancelled) setTargetsLoading(false);
      }
    }

    void loadTargets();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      <main className="flex-1 bg-gradient-to-br from-rose-50 via-emerald-50 to-pink-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="min-w-0">
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

            <div className="mt-6 max-w-3xl rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
              <label
                htmlFor="create-workspace-target"
                className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
              >
                Place into Workspace (optional)
              </label>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                Leave as My bots for a personal bot. Choosing a Workspace places
                the new bot there when you are allowed to create into it.
              </p>
              <select
                id="create-workspace-target"
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                disabled={targetsLoading}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-700"
              >
                <option value={PERSONAL_CREATE_TARGET_VALUE}>
                  My bots (personal)
                </option>
                {allowedTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
              {targetsLoading && (
                <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
                  Loading workspaces…
                </p>
              )}
              {!targetsLoading && targetsError && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {targetsError}. You can still create under My bots.
                </p>
              )}
            </div>

            <div className="mt-8 max-w-3xl">
              <CreateAppForm
                onCreate={(id) => router.push(`/app/${id}/editor`)}
                genaiModel={selectedModel}
                genaiApiKey={apiKey}
                workspaceId={
                  selectedWorkspaceId.trim()
                    ? selectedWorkspaceId.trim()
                    : undefined
                }
              />
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
