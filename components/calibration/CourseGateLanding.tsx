"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QueueStatus from "./QueueStatus";
import {
  checkInApiHref,
  nextLocationAfterCheckIn,
  offeringGatePath,
  parseCheckInResponse,
} from "@/lib/calibration-ui/gate";

export default function CourseGateLanding({
  offeringId,
  offeringTitle,
  initial,
}: {
  offeringId: string;
  offeringTitle: string;
  initial: {
    checkedIn: boolean;
    queueCount: number;
    teamId: string | null;
    role: "operator" | "learner";
  };
}) {
  const router = useRouter();
  const [checkedIn, setCheckedIn] = useState(initial.checkedIn);
  const [queueCount, setQueueCount] = useState(initial.queueCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleEnter() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(checkInApiHref(offeringId), {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseCheckInResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setCheckedIn(true);
      setQueueCount(parsed.view.queueCount);
      const next = nextLocationAfterCheckIn(offeringId, parsed.view);
      if (next !== offeringGatePath(offeringId)) {
        router.push(next);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
        Collaborative activity
      </p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-zinc-100">
        {offeringTitle}
      </h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">
        Join to wait for two other learners. A team of three starts together.
      </p>

      {initial.role === "operator" && !checkedIn && (
        <p className="mt-3 text-sm text-slate-500 dark:text-zinc-500">
          You are viewing this activity as the instructor. Join only if you
          also want to take part as a learner.
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        {checkedIn ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              You have joined. Waiting for teammates.
            </p>
            <QueueStatus queueCount={queueCount} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleEnter()}
            disabled={busy}
            className="pressable inline-flex h-11 items-center rounded-xl bg-sky-700 px-5 text-sm font-semibold text-white shadow-sm hover-ok:bg-sky-800 disabled:opacity-50 dark:bg-sky-600 dark:hover-ok:bg-sky-500"
          >
            {busy ? "Joining…" : "Join"}
          </button>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
