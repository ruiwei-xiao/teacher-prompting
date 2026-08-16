"use client";

import { useEffect, useMemo, useState } from "react";
import { offeringGatePath, queueStatusLabel } from "@/lib/calibration-ui/gate";
import {
  canConfirmManualMatch,
  formatWaitDuration,
  matchPostBody,
  operateDashboardApiHref,
  operateMatchApiHref,
  operatorInspectHref,
  parseDashboardResponse,
  parseMatchResponse,
  labelForUserId,
  type OperatorDashboardView,
} from "@/lib/calibration-ui/operator";

export default function OperatorDashboard({
  offeringId,
  initial,
}: {
  offeringId: string;
  initial: OperatorDashboardView;
}) {
  const [waiters, setWaiters] = useState(initial.waiters);
  const [teams, setTeams] = useState(initial.teams);
  const [queueCount, setQueueCount] = useState(initial.queueCount);
  const [labels, setLabels] = useState(initial.labels ?? {});
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const joinPath = offeringGatePath(offeringId);
  const [joinUrl, setJoinUrl] = useState(joinPath);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}${joinPath}`);
  }, [joinPath]);

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
    setWaiters(parsed.view.waiters);
    setTeams(parsed.view.teams);
    setQueueCount(parsed.view.queueCount);
    setLabels(parsed.view.labels);
  }

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the join link");
    }
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
          Instructor
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
          Activity progress
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">
          Share the join link with learners, watch the matching queue, and
          follow every team&apos;s progress.
        </p>
      </header>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Learner join link
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Learners open this link to join. You stay here as the instructor.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            {joinUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyJoinLink()}
            className="pressable inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3.5 text-sm font-semibold text-sky-800 shadow-sm hover-ok:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200 dark:hover-ok:bg-sky-900/60"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-800 dark:text-zinc-200">
          {queueStatusLabel(queueCount)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
          {teams.length === 0
            ? "No teams have formed yet."
            : `${teams.length} team${teams.length === 1 ? "" : "s"} formed.`}
        </p>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Learners
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Everyone who has joined. Waiting learners can be selected to form a
          team of three.
        </p>

        {waiters.length === 0 && teams.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-zinc-500">
            No learners have joined yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {waiters.map((waiter) => {
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
                        {labelForUserId(waiter.userId, labels)}
                      </span>
                      <span className="mt-0.5 block text-slate-600 dark:text-zinc-400">
                        Waiting · {formatWaitDuration(waiter.waitedMs)}
                        {waiter.stuck ? " · 10+ days" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {teams.flatMap((team, teamIndex) =>
              team.members.map((userId) => (
                <li
                  key={`${team.teamId}:${userId}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900 dark:text-zinc-100">
                      {labelForUserId(userId, labels)}
                    </span>
                    <span className="mt-0.5 block capitalize text-slate-600 dark:text-zinc-400">
                      Team {teamIndex + 1} · {team.phase}
                    </span>
                  </span>
                  <a
                    href={operatorInspectHref(offeringId, team.teamId)}
                    className="shrink-0 text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
                  >
                    Inspect
                  </a>
                </li>
              ))
            )}
          </ul>
        )}

        {waiters.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleMatch()}
              disabled={!canConfirm || busy}
              className="pressable inline-flex h-11 items-center rounded-lg bg-sky-600 px-5 text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {busy ? "Forming team…" : "Form team of 3"}
            </button>
            <p className="text-xs text-slate-500 dark:text-zinc-500">
              {selectedUserIds.length} of 3 selected
            </p>
          </div>
        ) : null}

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
                  <th className="py-2 pr-4 font-medium">Team</th>
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
                {teams.map((team, teamIndex) => (
                  <tr
                    key={team.teamId}
                    className="border-b border-slate-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-4 text-slate-900 dark:text-zinc-100">
                      Team {teamIndex + 1}
                    </td>
                    <td className="py-2 pr-4 capitalize text-slate-900 dark:text-zinc-100">
                      {team.phase}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-zinc-300">
                      {team.members
                        .map((userId) => labelForUserId(userId, labels))
                        .join(", ")}
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
