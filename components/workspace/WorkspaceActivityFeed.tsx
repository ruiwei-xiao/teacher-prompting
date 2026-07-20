"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  WorkspaceActivityEvent,
  WorkspaceRole,
} from "@/lib/workspace-store/types";
import {
  activityApiHref,
  canViewFacilitationActivity,
  formatActivitySummary,
  formatActivityTimestamp,
  parseActivityListResponse,
  sortActivityNewestFirst,
} from "@/lib/workspace-ui/activity";

export default function WorkspaceActivityFeed({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: WorkspaceRole;
}) {
  const facilitation = canViewFacilitationActivity(role);
  const [events, setEvents] = useState<WorkspaceActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!workspaceId) {
      setError("Missing workspace id");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(activityApiHref(workspaceId));
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseActivityListResponse(res.status, body);
        if (!parsed.ok) {
          setError(parsed.error);
          setEvents([]);
          return;
        }
        setEvents(parsed.events);
      } catch {
        if (!cancelled) {
          setError("Failed to load activity");
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const chronological = useMemo(
    () => sortActivityNewestFirst(events),
    [events]
  );

  return (
    <section className="space-y-4" aria-labelledby="workspace-activity-heading">
      <div>
        <h2
          id="workspace-activity-heading"
          className="text-lg font-semibold text-slate-900 dark:text-zinc-100"
        >
          Activity
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
          {facilitation
            ? "Recent membership, placement, and settings events for this Workspace."
            : "Recent bot placement events you are allowed to see in this Workspace."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          Loading activity…
        </p>
      ) : error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : chronological.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          No recent activity yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {chronological.map((event) => (
            <li
              key={event.id}
              className="border-b border-slate-200 pb-3 last:border-b-0 last:pb-0 dark:border-zinc-800"
            >
              <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                {formatActivitySummary(event)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                <time dateTime={event.createdAt}>
                  {formatActivityTimestamp(event.createdAt)}
                </time>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>{event.type}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
