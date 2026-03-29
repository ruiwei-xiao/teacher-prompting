import Icon from "@/components/common/Icon";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function EditorChrome({
  appName,
  modelLabel,
  variabilityLabel,
  onShare,
  shareBusy,
  shareDisabled,
  onPublish,
  publishBusy,
  children,
}: {
  appName: React.ReactNode;
  modelLabel?: React.ReactNode;
  variabilityLabel?: React.ReactNode;
  onShare?: () => void;
  shareBusy?: boolean;
  shareDisabled?: boolean;
  onPublish?: () => void;
  publishBusy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      {/* Sticky header spans full width */}
      <header className="sticky top-0 z-10 h-16 border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-full w-full items-center justify-between page-pad">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="rounded p-2 text-slate-900 hover:bg-slate-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Back"
            >
              <Icon d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </a>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{appName}</h1>
          </div>
          <div className="flex items-center gap-2">
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
            {onPublish && (
              <button
                className="rounded-lg bg-sky-600 text-white px-3 h-9 disabled:opacity-50"
                onClick={onPublish}
                disabled={publishBusy}
                type="button"
              >
                {publishBusy ? "Publishing..." : "Publish"}
              </button>
            )}
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

      {/* Full-bleed content that fills the rest of the viewport */}
      <main className="page-pad min-h-0 flex-1 overflow-hidden">
        <div className="main-viewport box-border min-h-0 overflow-hidden py-4 md:py-5">
          {children}
        </div>
      </main>
    </div>
  );
}
