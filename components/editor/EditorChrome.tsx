import type { Ref } from "react";
import Link from "next/link";
import Icon from "@/components/common/Icon";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function EditorChrome({
  appName,
  modelLabel,
  variabilityLabel,
  activityHref,
  onShare,
  shareBusy,
  shareDisabled,
  onPublish,
  publishActionLabel,
  publishNotice,
  publishStatusLabel,
  publishBusy,
  publishButtonRef,
  onReplayEditorGuide,
  children,
}: {
  appName: React.ReactNode;
  modelLabel?: React.ReactNode;
  variabilityLabel?: React.ReactNode;
  activityHref?: string;
  onShare?: () => void;
  shareBusy?: boolean;
  shareDisabled?: boolean;
  onPublish?: () => void;
  /** Visible action. Omit the control when this is null. */
  publishActionLabel?: "Publish" | "Republish" | null;
  publishNotice?: string | null;
  publishStatusLabel?: string | null;
  publishBusy?: boolean;
  /**
   * Optional ref on the Publish or Republish control (e.g. onboarding spotlight).
   * Absent when no action button is rendered.
   */
  publishButtonRef?: Ref<HTMLButtonElement | null>;
  onReplayEditorGuide?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      {/* Sticky header spans full width */}
      <header className="sticky top-0 z-10 h-16 border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-full w-full items-center justify-between page-pad">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <a
              href="/"
              className="shrink-0 rounded p-2 text-slate-900 hover:bg-slate-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Back"
            >
              <Icon d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </a>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900 dark:text-zinc-100">
                {appName}
              </h1>
              {onReplayEditorGuide ? (
                <button
                  type="button"
                  onClick={onReplayEditorGuide}
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Replay the guide
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-800 dark:bg-zinc-800 dark:text-zinc-200">
                {modelLabel || "Loading model..."}
              </span>
              <span className="text-slate-400 dark:text-zinc-500">with</span>
              <span className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-800 dark:bg-zinc-800 dark:text-zinc-200">
                {variabilityLabel || "70% variability"}
              </span>
            </div>
            <ThemeToggle />
            {activityHref ? (
              <Link
                href={activityHref}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Activity
              </Link>
            ) : null}
            {publishStatusLabel ? (
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {publishStatusLabel}
              </span>
            ) : null}
            {onPublish && publishActionLabel ? (
              <button
                ref={publishButtonRef}
                className="rounded-lg bg-sky-600 text-white px-3 h-9 disabled:opacity-50"
                onClick={onPublish}
                disabled={publishBusy}
                type="button"
              >
                {publishBusy ? "Publishing..." : publishActionLabel}
              </button>
            ) : null}
            {onShare && (
              <button
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={onShare}
                disabled={shareBusy || shareDisabled}
                type="button"
                title={shareDisabled ? "Publish this bot before sharing." : undefined}
              >
                {shareBusy ? "Preparing..." : "Share"}
              </button>
            )}
          </div>
        </div>
      </header>
      {publishNotice ? (
        <p
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {publishNotice}
        </p>
      ) : null}

      {/* Full-bleed content that fills the rest of the viewport */}
      <main className="page-pad min-h-0 flex-1 overflow-hidden">
        <div className="main-viewport box-border min-h-0 overflow-hidden py-4 md:py-5">
          {children}
        </div>
      </main>
    </div>
  );
}
