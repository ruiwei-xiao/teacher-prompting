"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MY_BOTS_HREF, workspaceHubHref } from "@/lib/workspace-ui/nav";
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
        e instanceof Error ? e.message : "Failed to duplicate bot"
      );
      setDuplicating(false);
    }
  }

  if (state.status === "loading") {
    return <p className="text-slate-600 dark:text-zinc-300">Loading…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <p className="text-red-700 dark:text-red-300">{state.message}</p>
        <div className="flex flex-wrap gap-4">
          <Link
            href={workspaceHubHref(workspaceId)}
            className="inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            ← Back to Workspace
          </Link>
          <Link
            href={MY_BOTS_HREF}
            className="inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            My bots
          </Link>
        </div>
      </div>
    );
  }

  const { app } = state;
  const objective = app.builderState?.learningObjective?.trim();

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Peer preview · Read-only
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
          {app.name}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
          Inspect this Workspace bot without editing. Duplicate it into My bots
          to make your own editable copy — the original stays with its author.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link
            href={workspaceHubHref(workspaceId)}
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            ← Back to Workspace
          </Link>
          <Link
            href={MY_BOTS_HREF}
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            My bots
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Non-edit inspect
            </div>
            <div className="mt-1">
              Authoring controls are unavailable here. Duplicate to continue
              editing in your own My bots.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            disabled={duplicating}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-sky-600 px-5 text-sm font-medium text-white disabled:opacity-50 hover:bg-sky-700"
          >
            {duplicating ? "Duplicating…" : "Duplicate into My bots"}
          </button>
        </div>
        {duplicateError && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">
            {duplicateError}
          </p>
        )}
      </div>

      <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-zinc-500/80 dark:bg-zinc-800">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            Description
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-zinc-200">
            {app.description?.trim() || "No description."}
          </p>
        </div>

        {objective ? (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
              Learning objective
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-zinc-200">
              {objective}
            </p>
          </div>
        ) : null}

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            System prompt
          </h2>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">
            {app.systemPrompt?.trim() || "No system prompt."}
          </pre>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-zinc-400">
          <span>
            Model: {app.provider} / {app.model}
          </span>
          {app.updatedAt && (
            <span>
              Updated {new Date(app.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
