export default function RightRail({
  assistantOpen,
  settingsOpen,
  showSettings = true,
  onToggleAssistant,
  onOpenSettings,
}: {
  assistantOpen: boolean;
  settingsOpen: boolean;
  showSettings?: boolean;
  onToggleAssistant: () => void;
  onOpenSettings: () => void;
}) {
  const Icon = ({
    d,
    className = "h-5 w-5",
  }: {
    d: string;
    className?: string;
  }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );

  const Btn = ({
    label,
    hint,
    icon,
    active = false,
    onClick,
  }: {
    label: string;
    hint: string;
    icon: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        "group relative flex h-11 w-11 items-center justify-center rounded-xl",
        "transition-[background-color,color,transform] duration-150 ease-out",
        "active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
        active
          ? "bg-sky-600 text-white dark:bg-sky-500"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {icon}

      <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 origin-left scale-[0.97] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left whitespace-nowrap opacity-0 shadow-lg transition-[opacity,transform] duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 dark:border-zinc-600 dark:bg-zinc-900">
        <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">{label}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{hint}</div>
      </div>
    </button>
  );

  return (
    <aside className="flex h-full flex-col items-center bg-slate-50 px-2 py-4 dark:bg-zinc-950">
      <div className="flex flex-col gap-1.5">
        <Btn
          active={assistantOpen}
          onClick={onToggleAssistant}
          label="Assistant"
          hint={assistantOpen ? "Hide left panel" : "Show left panel"}
          icon={
            <Icon d="M12 2a2 2 0 00-2 2v1H8a3 3 0 00-3 3v6a3 3 0 003 3h2v1a2 2 0 104 0v-1h2a3 3 0 003-3V8a3 3 0 00-3-3h-2V4a2 2 0 00-2-2zm-2 7a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm4 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-5 7h6v-1.5H9V16z" />
          }
        />
        {showSettings && (
          <Btn
            active={settingsOpen}
            onClick={onOpenSettings}
            label="Settings"
            hint="Model, API key, assisted mode"
            icon={
              <Icon d="M19.14 12.94a7.48 7.48 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.6 7.6 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.48 7.48 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.51.4 1.05.71 1.63.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
            }
          />
        )}
      </div>
    </aside>
  );
}
