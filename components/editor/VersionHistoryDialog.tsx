"use client";

import { useEffect, useId, useRef, useState } from "react";
import { readResponseError } from "@/components/editor/publish-state";
import {
  canRevertVersion,
  DIFF_PREVIOUS_LABEL,
  DIFF_THIS_VERSION_LABEL,
  formatVersionTimestamp,
  historyListAfterRevert,
  historyListRows,
  PUBLISHED_BADGE,
  readHistoryDetail,
  readHistoryList,
  readRevertSuccess,
  revertFailureMessage,
  versionComparison,
  versionDetailFields,
  type HistoryVersionDetail,
  type HistoryVersionSummary,
  type RevertSuccess,
} from "@/components/editor/version-history";

function VersionComparisonView({ detail }: { detail: HistoryVersionDetail }) {
  const comparison = versionComparison(detail);
  if (comparison.kind === "none") {
    return <p className="text-sm text-slate-600 dark:text-zinc-300">{comparison.message}</p>;
  }
  return (
    <div className="space-y-3">
      {comparison.rows.map((row) => (
        <div
          key={row.field}
          className="rounded-xl border border-slate-200 p-3 dark:border-zinc-700"
        >
          <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">{row.field}</div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                {DIFF_PREVIOUS_LABEL}
              </div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-zinc-200">
                {row.previous}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                {DIFF_THIS_VERSION_LABEL}
              </div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-zinc-200">
                {row.thisVersion}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VersionHistoryDialog({
  appId,
  open,
  publishedVersionId,
  onClose,
  onReverted,
  onRevertFailed,
}: {
  appId: string;
  open: boolean;
  publishedVersionId: string | null;
  onClose: () => void;
  onReverted: (result: RevertSuccess) => void;
  onRevertFailed: (body: unknown) => void;
}) {
  const titleId = useId();
  const detailRequestRef = useRef(0);
  const [versions, setVersions] = useState<HistoryVersionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryVersionDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setDetail(null);
    setError("");
    let cancelled = false;

    async function loadList() {
      setLoadingList(true);
      setError("");
      try {
        const res = await fetch(`/api/apps/${appId}/config-versions`);
        const body: unknown = await res.json().catch(() => null);
        if (cancelled) return;
        const list = readHistoryList(body);
        if (!res.ok || !list) {
          setVersions([]);
          setError(readResponseError(body, "Failed to load version history."));
          return;
        }
        setVersions(list);
      } catch {
        if (!cancelled) setError("Failed to load version history.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    void loadList();
    return () => {
      cancelled = true;
    };
  }, [appId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && revertingId === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, revertingId]);

  if (!open) return null;

  const rows = historyListRows(versions);
  const selected = versions.find((version) => version.id === selectedId) ?? null;
  const detailMatches = detail !== null && detail.version.id === selectedId;
  const detailFields = detailMatches ? versionDetailFields(detail.version) : [];
  const showRevert = selected ? canRevertVersion(selected) : false;

  async function selectVersion(versionId: string) {
    const requestId = ++detailRequestRef.current;
    setSelectedId(versionId);
    setError("");
    try {
      const res = await fetch(
        `/api/apps/${appId}/config-versions/${encodeURIComponent(versionId)}`
      );
      const body: unknown = await res.json().catch(() => null);
      if (requestId !== detailRequestRef.current) return;
      const nextDetail = readHistoryDetail(body);
      if (!res.ok || !nextDetail) {
        setDetail(null);
        setError(readResponseError(body, "Failed to load this version."));
        return;
      }
      setDetail(nextDetail);
    } catch {
      if (requestId !== detailRequestRef.current) return;
      setDetail(null);
      setError("Failed to load this version.");
    }
  }

  async function reloadList(): Promise<HistoryVersionSummary[] | null> {
    const res = await fetch(`/api/apps/${appId}/config-versions`);
    const body: unknown = await res.json().catch(() => null);
    const list = readHistoryList(body);
    if (!res.ok || !list) return null;
    setVersions(list);
    return list;
  }

  async function revert(versionId: string) {
    if (revertingId) return;
    setRevertingId(versionId);
    setError("");
    try {
      const res = await fetch(
        `/api/apps/${appId}/config-versions/${encodeURIComponent(versionId)}/revert`,
        { method: "POST" }
      );
      const body: unknown = await res.json().catch(() => null);
      const success = readRevertSuccess(body);
      if (!res.ok || !success) {
        setError(revertFailureMessage(body));
        onRevertFailed(body);
        return;
      }

      onReverted(success);
      detailRequestRef.current += 1;
      setSelectedId(success.version.id);
      setDetail(null);
      setVersions((current) =>
        historyListAfterRevert(current, success.version, publishedVersionId)
      );

      const list = await reloadList().catch(() => null);
      if (list) setVersions(list);
      await selectVersion(success.version.id);
    } catch {
      const body = { error: "Failed to revert this version." };
      setError(revertFailureMessage(body));
      onRevertFailed(body);
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 dark:bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
              History
            </div>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-100">
              Version history
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              Review a saved configuration. Revert copies it into a new draft and leaves the published bot unchanged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={revertingId !== null}
            className="rounded-lg px-2 py-1 text-slate-500 transition-[background-color,transform,color] duration-150 ease-out hover:bg-slate-100 active:scale-[0.97] disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-3 md:border-b-0 md:border-r dark:border-zinc-700">
            {loadingList ? (
              <p className="px-2 py-3 text-sm text-slate-500 dark:text-zinc-400">
                Loading version history...
              </p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500 dark:text-zinc-400">No versions yet.</p>
            ) : (
              <ul className="space-y-1">
                {rows.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => void selectVersion(row.id)}
                        className={[
                          "w-full rounded-xl px-3 py-2 text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.99]",
                          active
                            ? "bg-sky-50 text-slate-900 dark:bg-sky-950/40 dark:text-zinc-100"
                            : "hover:bg-slate-50 dark:hover:bg-zinc-800",
                        ].join(" ")}
                      >
                        <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                          {row.updatedAtLabel}
                        </div>
                        {row.badges.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.badges.map((badge) => (
                              <span
                                key={badge}
                                className={[
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  badge === PUBLISHED_BADGE
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200"
                                    : "bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-200",
                                ].join(" ")}
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-4">
            {!selectedId ? (
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Select a version to see its settings and what changed.
              </p>
            ) : !detailMatches ? (
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                {error ? "This version could not be loaded." : "Loading version..."}
              </p>
            ) : detail ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm text-slate-600 dark:text-zinc-300">
                    <p>Created {formatVersionTimestamp(detail.version.createdAt)}</p>
                    <p>Updated {formatVersionTimestamp(detail.version.updatedAt)}</p>
                  </div>
                  {showRevert ? (
                    <button
                      type="button"
                      onClick={() => void revert(detail.version.id)}
                      disabled={revertingId !== null}
                      className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-sky-700 active:scale-[0.97] disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400"
                    >
                      {revertingId === detail.version.id ? "Reverting..." : "Revert"}
                    </button>
                  ) : null}
                </div>

                <dl className="space-y-3">
                  {detailFields.map((field) => (
                    <div key={field.label}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                        {field.label}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                        {field.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    Comparison
                  </h3>
                  <VersionComparisonView detail={detail} />
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
