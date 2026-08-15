"use client";

import { useMemo, useState } from "react";
import {
  addendaApiHref,
  addendumPostBody,
  appendPostedAddendum,
  buildDeliverableView,
  parseAddendumPostResponse,
  type DeliverableAddendum,
  type DeliverableRole,
} from "@/lib/calibration-ui/deliverable";

function criterionLabel(key: string): string {
  if (!key) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function FinalDeliverable({
  teamId,
  viewerUserId,
  role,
  locked,
  autoFinalized,
  rubricText,
  flaggedCriteria,
  initialAddenda,
}: {
  teamId: string;
  viewerUserId: string;
  role: DeliverableRole;
  locked: boolean;
  autoFinalized: boolean;
  rubricText: string;
  flaggedCriteria: string[];
  initialAddenda: DeliverableAddendum[];
}) {
  const [addenda, setAddenda] = useState<DeliverableAddendum[]>(initialAddenda);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const view = useMemo(
    () =>
      buildDeliverableView({
        locked,
        autoFinalized,
        rubricText,
        flaggedCriteria,
        addenda,
        role,
      }),
    [locked, autoFinalized, rubricText, flaggedCriteria, addenda, role]
  );

  if (!view.visible) return null;

  async function handleSubmit() {
    if (!view.canPostAddendum) return;
    const payload = addendumPostBody(draft);
    if (!payload.body) {
      setError("Write a short personal addendum first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch(addendaApiHref(teamId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseAddendumPostResponse(res.status, body);
      if (!parsed.ok) throw new Error(parsed.error);
      setAddenda((current) =>
        appendPostedAddendum(
          { ...view, addenda: current, rubricText: view.rubricText },
          parsed.addendum
        ).addenda
      );
      setDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to post addendum");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Final deliverable"
      className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Final deliverable
          </h2>
          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
            The group rubric is locked. Personal addenda do not change it.
          </p>
        </div>
        {view.autoFinalized && (
          <p className="rounded-full bg-amber-200/80 px-3 py-1 text-xs font-medium text-amber-950 dark:bg-amber-900/70 dark:text-amber-100">
            Auto-finalized
          </p>
        )}
      </div>

      <article className="mt-4 rounded-xl border border-amber-200/70 bg-white/80 px-4 py-3 dark:border-amber-900/40 dark:bg-zinc-950/50">
        <h3 className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Locked rubric
        </h3>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-zinc-100">
          {view.rubricText || "No rubric text was stored."}
        </pre>
      </article>

      {view.unresolvedLabels.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Unresolved criteria
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {view.unresolvedLabels.map((label) => (
              <li
                key={label}
                className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-900 dark:bg-rose-950/70 dark:text-rose-100"
              >
                Unresolved · {criterionLabel(label)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Personal addenda
        </h3>
        {view.addenda.length === 0 ? (
          <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
            No personal addenda yet.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {view.addenda.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-amber-200/60 bg-white/70 px-3 py-2 text-sm text-slate-800 dark:border-amber-900/40 dark:bg-zinc-950/40 dark:text-zinc-100"
              >
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {row.userId === viewerUserId ? "You" : "Teammate"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{row.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {view.showComposer && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-amber-950 dark:text-amber-100">
              Add a personal addendum
            </span>
            <textarea
              className="mt-1 block min-h-24 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-amber-900/60 dark:bg-zinc-950 dark:text-zinc-100"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Your note stays personal. The locked group rubric does not change."
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-800 px-3 py-2 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-50 dark:bg-amber-700"
          >
            {busy ? "Posting…" : "Post addendum"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      )}
    </section>
  );
}
