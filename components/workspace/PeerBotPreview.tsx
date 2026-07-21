"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { workspaceHubHref } from "@/lib/workspace-ui/nav";
import {
  parsePeerBotDuplicateResponse,
  parsePeerBotSnapshotResponse,
  peerBotDuplicateApiHref,
  peerBotSnapshotApiHref,
  type PeerBotPreviewSnapshot,
} from "@/lib/workspace-ui/peer-preview";

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; app: PeerBotPreviewSnapshot };

export default function PeerBotPreview({
  workspaceId,
  appId,
}: {
  workspaceId: string;
  appId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState("");

  useEffect(() => {
    if (!workspaceId || !appId) {
      setState({ status: "error", message: "Missing workspace or bot id" });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(peerBotSnapshotApiHref(workspaceId, appId));
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parsePeerBotSnapshotResponse(res.status, body);
        if (!parsed.ok) {
          setState({ status: "error", message: parsed.error });
          return;
        }
        setState({ status: "ready", app: parsed.app });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Failed to load bot preview" });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, appId]);

  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    setDuplicateError("");
    try {
      const res = await fetch(peerBotDuplicateApiHref(workspaceId, appId), {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parsePeerBotDuplicateResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      // New bot is under the viewer; open their editor. Source ownership unchanged.
      router.push(`/app/${parsed.app.id}/editor`);
    } catch (e: unknown) {
      setDuplicateError(
        e instanceof Error ? e.message : "Failed to duplicate bot",
      );
      setDuplicating(false);
    }
  }

  if (state.status === "loading") {
    return (
      <p className="text-sm text-slate-600 dark:text-zinc-300">
        Loading preview…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <p className="text-red-700 dark:text-red-300">{state.message}</p>
        <Link
          href={workspaceHubHref(workspaceId)}
          className="inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
        >
          ← Back to Workspace
        </Link>
      </div>
    );
  }

  const { app } = state;
  const objective = app.builderState?.learningObjective?.trim();
  const description = app.description?.trim();
  const prompt = app.systemPrompt?.trim();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={workspaceHubHref(workspaceId)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-sky-700 dark:text-zinc-400 dark:hover:text-sky-300"
        >
          <span aria-hidden="true">←</span>
          Back to Workspace
        </Link>
      </div>

      <header className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
            Workspace bot
          </span>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            Read-only inspect
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="type-display text-3xl text-slate-900 dark:text-zinc-50 sm:text-4xl">
            {app.name}
          </h1>
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            disabled={duplicating}
            className="pressable inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition-[background-color,opacity] duration-200 hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {duplicating ? "Duplicating…" : "Duplicate into My bots"}
          </button>
        </div>

        {duplicateError ? (
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {duplicateError}
          </p>
        ) : null}
      </header>

      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700">
            {app.provider} · {app.model}
          </span>
          {app.updatedAt ? (
            <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700">
              Updated {new Date(app.updatedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>

        <section className="space-y-8 border-t border-slate-200 pt-8 dark:border-zinc-700">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">
              Description
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-800 dark:text-zinc-100">
              {description || "No description."}
            </p>
          </div>

          {objective ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">
                Learning objective
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-800 dark:text-zinc-100">
                {objective}
              </p>
            </div>
          ) : null}

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">
              System prompt
            </h2>
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950/[0.03] px-5 py-4 font-mono text-sm leading-7 text-slate-800 ring-1 ring-slate-200 dark:bg-black/30 dark:text-zinc-100 dark:ring-zinc-700">
              {prompt || "No system prompt."}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
