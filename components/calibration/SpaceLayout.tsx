"use client";

import { useEffect, useState } from "react";
import ArtifactsPanel from "./ArtifactsPanel";
import GroupChatPanel from "./GroupChatPanel";
import ScoreSheet from "./ScoreSheet";
import type { ArtifactsView } from "@/lib/calibration-ui/artifacts";
import {
  SPACE_POLL_MS,
  currentRoundRoleLabel,
  parseSpaceResponse,
  phaseBannerLabel,
  recapMessages,
  retainVisitRecap,
  spaceApiHref,
  type SpaceView,
} from "@/lib/calibration-ui/space";

function PanelSlot({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-5 dark:border-zinc-700 dark:bg-zinc-900/40">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{hint}</p>
    </section>
  );
}

export default function SpaceLayout({
  teamId,
  viewerUserId,
  initialSpace,
  artifacts,
  criterionKeys,
}: {
  teamId: string;
  viewerUserId: string;
  initialSpace: SpaceView;
  artifacts: ArtifactsView;
  criterionKeys: string[];
}) {
  const [space, setSpace] = useState<SpaceView>(initialSpace);
  const roleLabel = currentRoundRoleLabel(space, viewerUserId);
  const recap = recapMessages(space);

  useEffect(() => {
    let cancelled = false;

    async function refetch() {
      const res = await fetch(spaceApiHref(teamId));
      const body = await res.json().catch(() => ({}));
      const parsed = parseSpaceResponse(res.status, body);
      if (!cancelled && parsed.ok) {
        setSpace((previous) => retainVisitRecap(previous, parsed.space));
      }
    }

    const intervalId = window.setInterval(() => {
      void refetch();
    }, SPACE_POLL_MS);

    function onFocus() {
      void refetch();
    }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [teamId]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-white/60 bg-white/70 px-5 py-4 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Rubric Calibration
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">
              {phaseBannerLabel(space)}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              Current phase updates as the team works. You do not need teammates
              online to continue.
            </p>
          </div>
          {roleLabel && (
            <p className="rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800 dark:bg-sky-950/70 dark:text-sky-200">
              You are {roleLabel}
            </p>
          )}
        </div>
      </header>

      {recap.length > 0 && (
        <section
          aria-label="Recap since last visit"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 dark:border-emerald-900/50 dark:bg-emerald-950/30"
        >
          <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            {space.recap.since
              ? "Since you last visited"
              : "Recap"}
          </h2>
          <ol className="mt-3 space-y-2">
            {recap.map((message) => (
              <li
                key={message.id}
                className="text-sm text-emerald-950 dark:text-emerald-100"
              >
                {message.body}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <GroupChatPanel
            teamId={teamId}
            viewerUserId={viewerUserId}
            space={space}
            onPosted={(next) =>
              setSpace((previous) => retainVisitRecap(previous, next))
            }
          />
          <PanelSlot
            title="Shared documents"
            hint="The shared rubric and notes will open here."
          />
        </div>
        <aside className="flex flex-col gap-6">
          <ArtifactsPanel artifacts={artifacts} />
          <ScoreSheet
            teamId={teamId}
            viewerUserId={viewerUserId}
            space={space}
            criterionKeys={criterionKeys}
            onSpace={(next) =>
              setSpace((previous) => retainVisitRecap(previous, next))
            }
          />
        </aside>
      </div>
    </div>
  );
}
