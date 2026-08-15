"use client";

import { useMemo, useState } from "react";
import {
  canConfirmManualMatch,
  formatWaitDuration,
  matchPostBody,
  operateDashboardApiHref,
  operateMatchApiHref,
  operatorInspectHref,
  parseDashboardResponse,
  parseMatchResponse,
  type OperatorDashboardView,
} from "@/lib/calibration-ui/operator";

export default function OperatorDashboard({
  offeringId,
  initial,
}: {
  offeringId: string;
  initial: OperatorDashboardView;
}) {
  const [stuckWaiters, setStuckWaiters] = useState(initial.stuckWaiters);
  const [teams, setTeams] = useState(initial.teams);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canConfirm = useMemo(
    () => canConfirmManualMatch(selectedUserIds),
    [selectedUserIds]
  );

  function toggleWaiter(userId: string) {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  }

  async function refreshDashboard() {
    const res = await fetch(operateDashboardApiHref(offeringId));
    const body = await res.json().catch(() => ({}));
    const parsed = parseDashboardResponse(res.status, body);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    setStuckWaiters(parsed.view.stuckWaiters);
    setTeams(parsed.view.teams);
  }

  async function handleMatch() {
    setError("");
    if (!canConfirmManualMatch(selectedUserIds)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(operateMatchApiHref(offeringId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchPostBody(selectedUserIds)),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseMatchResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setSelectedUserIds([]);
      await refreshDashboard();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to form team");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Operator dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-zinc-100">
          Offering {offeringId}
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">
          Review learners waiting 10 to 14 days, form a team of three, and
          monitor every team&apos;s progress.
        </p>
      </header>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Stuck queue
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Select exactly three distinct waiters from this offering, then form
          the team.
        </p>

        {stuckWaiters.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-zinc-500">
            No learners have been waiting 10 days or more.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {stuckWaiters.map((waiter) => {
              const checked = selectedUserIds.includes(waiter.userId);
              return (
                <li key={waiter.checkInId}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleWaiter(waiter.userId)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900 dark:text-zinc-100">
                        {waiter.userId}
                      </span>
                      <span className="mt-0.5 block text-slate-600 dark:text-zinc-400">
                        Waited {formatWaitDuration(waiter.waitedMs)} · offering{" "}
                        {waiter.offeringId}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleMatch()}
            disabled={!canConfirm || busy}
            className="inline-flex h-11 items-center rounded-lg bg-sky-600 px-5 text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Forming team…" : "Form team of 3"}
          </button>
          <p className="text-xs text-slate-500 dark:text-zinc-500">
            {selectedUserIds.length} of 3 selected
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Team progress
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Every formed team: phase, members, last activity, and auto-finalized.
        </p>

        {teams.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-zinc-500">
            No teams have formed yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Phase</th>
                  <th className="py-2 pr-4 font-medium">Members</th>
                  <th className="py-2 pr-4 font-medium">Last activity</th>
                  <th className="py-2 pr-4 font-medium">Auto-finalized</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Inspect</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr
                    key={team.teamId}
                    className="border-b border-slate-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-4 capitalize text-slate-900 dark:text-zinc-100">
                      {team.phase}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-zinc-300">
                      {team.members.join(", ")}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-zinc-300">
                      {team.lastActivityAt}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-zinc-300">
                      {team.autoFinalized ? "Yes" : "No"}
                    </td>
                    <td className="py-2">
                      <a
                        href={operatorInspectHref(offeringId, team.teamId)}
                        className="text-sky-700 hover:underline dark:text-sky-400"
                      >
                        Inspect
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
