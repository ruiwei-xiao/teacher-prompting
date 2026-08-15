"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SCORE_MAX,
  SCORE_MIN,
  buildScoreSheetView,
  isValidScoreValue,
  parseScorePostResponse,
  scorePostBody,
  scoresApiHref,
} from "@/lib/calibration-ui/scores";
import {
  parseSpaceResponse,
  spaceApiHref,
  type SpaceView,
} from "@/lib/calibration-ui/space";

const SCALE = Array.from(
  { length: SCORE_MAX - SCORE_MIN + 1 },
  (_, index) => SCORE_MIN + index
);

function criterionLabel(key: string): string {
  if (!key) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function memberLabel(userId: string, viewerUserId: string): string {
  return userId === viewerUserId ? "You" : "Teammate";
}

export default function ScoreSheet({
  teamId,
  viewerUserId,
  space,
  criterionKeys,
  onSpace,
}: {
  teamId: string;
  viewerUserId: string;
  space: SpaceView;
  criterionKeys: string[];
  onSpace: (next: SpaceView) => void;
}) {
  const view = useMemo(
    () => buildScoreSheetView(space, viewerUserId, criterionKeys),
    [space, viewerUserId, criterionKeys]
  );
  const [draft, setDraft] = useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const row of space.ownScores) {
      next[row.criterionKey] = row.value;
    }
    return next;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);

  useEffect(() => {
    setDraft((previous) => {
      const next = { ...previous };
      for (const row of space.ownScores) {
        next[row.criterionKey] = row.value;
      }
      return next;
    });
  }, [space.ownScores]);

  const ready =
    view.canEnter &&
    view.criterionKeys.length > 0 &&
    view.criterionKeys.every((key) => isValidScoreValue(draft[key]));

  async function handleSubmit() {
    if (!view.canSubmit || !ready) return;
    setError("");
    setBusy(true);
    try {
      const payload = scorePostBody(
        view.criterionKeys.map((key) => ({
          criterionKey: key,
          value: draft[key],
        }))
      );
      const res = await fetch(scoresApiHref(teamId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseScorePostResponse(res.status, body);
      if (!parsed.ok) throw new Error(parsed.error);
      setAck(true);
      const spaceRes = await fetch(spaceApiHref(teamId));
      const spaceBody = await spaceRes.json().catch(() => ({}));
      const next = parseSpaceResponse(spaceRes.status, spaceBody);
      if (next.ok) onSpace(next.space);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit scores");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Score sheet"
      className="rounded-2xl border border-white/60 bg-white/70 px-4 py-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80"
    >
      <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
        Score sheet
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
        Private integer scores from {SCORE_MIN} to {SCORE_MAX} against the team
        rubric. Teammate values stay hidden until reveal.
      </p>

      {view.mode === "readonly" && (
        <p className="mt-4 text-sm text-slate-600 dark:text-zinc-400">
          {space.role === "operator"
            ? "Operator view. Scoring is read-only."
            : "Scoring opens after the team rubric is finalized."}
        </p>
      )}

      {view.mode === "entry" && view.criterionKeys.length === 0 && (
        <p className="mt-4 text-sm text-slate-600 dark:text-zinc-400">
          Waiting for the team rubric.
        </p>
      )}

      {view.canEnter && view.criterionKeys.length > 0 && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {view.criterionKeys.map((key) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-slate-800 dark:text-zinc-200">
                {criterionLabel(key)}
              </span>
              <select
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={draft[key] ?? ""}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setDraft((previous) => ({ ...previous, [key]: next }));
                }}
              >
                <option value="">Select {SCORE_MIN}–{SCORE_MAX}</option>
                {SCALE.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="submit"
            disabled={!ready || busy}
            className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-sky-600"
          >
            {busy ? "Submitting…" : "Submit scores"}
          </button>
        </form>
      )}

      {view.mode === "submitted" && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Your scores were submitted.
          </p>
          <ul className="space-y-1">
            {view.ownScores.map((row) => (
              <li
                key={row.criterionKey}
                className="text-sm text-slate-800 dark:text-zinc-200"
              >
                {criterionLabel(row.criterionKey)}: {row.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(view.mode === "entry" || view.mode === "submitted" || ack) &&
        view.submittedUserIds.length > 0 && (
          <ul className="mt-4 space-y-1" aria-label="Submission status">
            {view.submittedUserIds.map((userId) => (
              <li
                key={userId}
                className="text-sm text-slate-600 dark:text-zinc-400"
              >
                {memberLabel(userId, viewerUserId)} submitted ✓
              </li>
            ))}
          </ul>
        )}

      {view.mode === "matrix" && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Criterion</th>
                {view.matrix.map((row) => (
                  <th key={row.userId} className="py-2 px-2 font-medium">
                    {memberLabel(row.userId, viewerUserId)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.criterionKeys.map((key) => {
                const flagged = view.flaggedKeys.includes(key);
                return (
                  <tr
                    key={key}
                    data-flagged={flagged ? "true" : "false"}
                    className={
                      flagged
                        ? "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                        : "text-slate-800 dark:text-zinc-200"
                    }
                  >
                    <td className="py-2 pr-3 font-medium">
                      {criterionLabel(key)}
                      {flagged ? " · flagged" : ""}
                    </td>
                    {view.matrix.map((row) => (
                      <td key={row.userId} className="py-2 px-2">
                        {row.scores.find((score) => score.criterionKey === key)
                          ?.value ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      )}
    </section>
  );
}
