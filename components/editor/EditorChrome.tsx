import Icon from "@/components/common/Icon";

export default function EditorChrome({
  appName,
  modelLabel,
  variabilityLabel,
  onPublish,
  publishBusy,
  children,
}: {
  appName: React.ReactNode;
  modelLabel?: React.ReactNode;
  variabilityLabel?: React.ReactNode;
  onPublish?: () => void;
  publishBusy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      {/* Sticky header spans full width */}
      <header className="border-b bg-white h-16 sticky top-0 z-10">
        <div className="h-full w-full page-pad flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="p-2 rounded hover:bg-slate-100" aria-label="Back">
              <Icon d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </a>
            <h1 className="text-lg font-semibold">{appName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-slate-100 text-sm">
                {modelLabel || "Loading model..."}
              </span>
              <span className="text-slate-400">with</span>
              <span className="px-2 py-1 rounded bg-slate-100 text-sm">
                {variabilityLabel || "70% variability"}
              </span>
            </div>
            <button
              className="rounded-lg bg-sky-600 text-white px-3 h-9 disabled:opacity-50"
              onClick={onPublish}
              disabled={publishBusy}
              type="button"
            >
              {publishBusy ? "Publishing..." : "Publish"}
            </button>
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
