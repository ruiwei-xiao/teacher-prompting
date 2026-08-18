"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { labelForUserId } from "@/lib/auth/user-label";
import {
  agreementPostBody,
  agreementsApiHref,
  canMarkReady,
  canWithdrawReady,
  hasMarkedReady,
  isReadyPhase,
  readyButtonLabel,
  readyHint,
  readySubjectForPhase,
  undoReadyLabel,
} from "@/lib/calibration-ui/agreements";
import { parseSpaceResponse, type SpaceView } from "@/lib/calibration-ui/space";
import { lucideSm } from "./lucide";

function personName(
  userId: string,
  viewerUserId: string,
  labels: Record<string, string>
): string {
  if (userId === viewerUserId) return "You";
  return labelForUserId(userId, labels);
}

export default function ReadyBar({
  teamId,
  viewerUserId,
  space,
  onSpace,
}: {
  teamId: string;
  viewerUserId: string;
  space: SpaceView;
  onSpace: (next: SpaceView) => void;
}) {
  const subject = readySubjectForPhase(space.phase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!subject || !isReadyPhase(space.phase)) return null;

  const agreementSubject = subject;
  const already = hasMarkedReady(space, viewerUserId);
  const canPress = canMarkReady(space, viewerUserId);
  const canUndo = canWithdrawReady(space, viewerUserId);
  const hint = readyHint(space.phase, space.role);
  const readyNames = space.readyUserIds.map((userId) =>
    personName(userId, viewerUserId, space.labels)
  );
  const pendingNames = space.memberUserIds
    .filter((userId) => !space.readyUserIds.includes(userId))
    .map((userId) => personName(userId, viewerUserId, space.labels));

  async function postAgreement(withdrawn: boolean) {
    if (withdrawn ? !canUndo : !canPress) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(agreementsApiHref(teamId), {
        method: withdrawn ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agreementPostBody(agreementSubject)),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseSpaceResponse(res.status, body);
      if (!parsed.ok) throw new Error(parsed.error);
      onSpace(parsed.space);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : withdrawn
            ? "Failed to undo Ready"
            : "Failed to mark Ready"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm text-slate-600 dark:text-zinc-300">{hint}</p>
      {readyNames.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
          Marked Ready: {readyNames.join(", ")}
          {pendingNames.length > 0 ? ` · Still needed: ${pendingNames.join(", ")}` : ""}
        </p>
      ) : pendingNames.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
          Still needed: {pendingNames.join(", ")}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      {space.role === "member" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {already ? (
            <>
              <p className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-50 px-4 text-sm font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                <Check {...lucideSm} />
                {readyButtonLabel(true, false)}
              </p>
              <button
                type="button"
                disabled={!canUndo || busy}
                onClick={() => void postAgreement(true)}
                className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-slate-600 transition-[transform,background-color] duration-150 ease-out hover:bg-slate-100 active:scale-[0.97] disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {undoReadyLabel(busy)}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!canPress || busy}
              onClick={() => void postAgreement(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-sky-700 active:scale-[0.97] disabled:opacity-50"
            >
              <Check {...lucideSm} />
              {readyButtonLabel(false, busy)}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
