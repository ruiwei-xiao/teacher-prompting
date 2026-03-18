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
};

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
}: Props) {
  return (
    <div className="flex h-full flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_16px_40px_rgba(15,23,42,0.09)]">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium uppercase tracking-wide text-emerald-700">
          {badge}
        </span>
        {meta && <span>{meta}</span>}
      </div>
      <h3 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{desc}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition hover:translate-y-[-1px] hover:from-sky-600 hover:to-sky-700"
        >
          {ctaLabel}
        </button>
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            disabled={shareDisabled}
            title={shareDisabled ? "Publish this bot before sharing." : undefined}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:translate-y-[-1px] hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-slate-300 disabled:hover:bg-white"
          >
            Share
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/40 px-5 text-sm font-medium text-rose-700 transition hover:translate-y-[-1px] hover:bg-rose-50"
          >
            Delete bot
          </button>
        )}
      </div>
    </div>
  );
}
