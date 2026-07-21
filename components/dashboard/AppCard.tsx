type Props = {
  title: string;
  desc: string;
  meta?: string;
  badge?: string;
  ctaLabel: string;
  onOpen?: () => void;
  onShare?: () => void;
  shareDisabled?: boolean;
  onDelete?: () => void;
  /** When provided with onToggleStar, shows star / unstar control. */
  starred?: boolean;
  onToggleStar?: () => void;
  starBusy?: boolean;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </svg>
  );
}

export default function AppCard({
  title,
  desc,
  meta,
  badge = "Bot",
  ctaLabel,
  onOpen,
  onShare,
  shareDisabled,
  onDelete,
  starred = false,
  onToggleStar,
  starBusy,
}: Props) {
  return (
    <div
      className={[
        "flex h-full flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-[box-shadow,border-color] hover:shadow-[0_16px_40px_rgba(15,23,42,0.09)]",
        "dark:border-zinc-500/80 dark:bg-zinc-800 dark:shadow-[0_0_0_1px_rgba(148,163,184,0.22),0_4px_28px_-6px_rgba(56,189,248,0.2),0_14px_44px_-14px_rgba(14,165,233,0.08)]",
        "dark:hover:border-sky-400/40 dark:hover:shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_8px_36px_-4px_rgba(56,189,248,0.26),0_22px_56px_-12px_rgba(14,165,233,0.14)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-200">
            {badge}
          </span>
          {meta && <span>{meta}</span>}
        </div>
        {onToggleStar && (
          <button
            type="button"
            onClick={onToggleStar}
            disabled={starBusy}
            aria-label={starred ? `Unstar ${title}` : `Star ${title}`}
            aria-pressed={starred}
            title={starred ? "Unstar" : "Star"}
            className={[
              "pressable inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-[colors,border-color,background-color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-50",
              starred
                ? "border-amber-300 bg-amber-50 text-amber-600 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:border-amber-600 dark:hover:bg-amber-950/60"
                : "border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50 dark:border-zinc-500/70 dark:bg-zinc-900/85 dark:text-zinc-300 dark:hover:border-sky-400/35 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <StarIcon filled={starred} />
          </button>
        )}
      </div>
      <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-zinc-100">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-zinc-300">{desc}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5 dark:border-zinc-600/60">
        <button
          type="button"
          onClick={onOpen}
          className="pressable inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition-[background-color] duration-200 hover:from-sky-600 hover:to-sky-700"
        >
          {ctaLabel}
        </button>
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            disabled={shareDisabled}
            title={shareDisabled ? "Publish this bot before sharing." : undefined}
            className="pressable inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition-[colors,border-color,background-color] duration-200 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-300 disabled:hover:bg-white dark:border-zinc-500/70 dark:bg-zinc-900/85 dark:text-zinc-100 dark:hover:border-sky-400/35 dark:hover:bg-zinc-900 disabled:dark:hover:bg-zinc-900/85"
          >
            Share
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="pressable inline-flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/40 px-5 text-sm font-medium text-rose-700 transition-[background-color] duration-200 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
          >
            Delete bot
          </button>
        )}
      </div>
    </div>
  );
}
