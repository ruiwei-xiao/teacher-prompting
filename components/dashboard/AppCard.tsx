type Props = {
  title: string;
  desc: string;
  meta?: string;
  badge?: string;
  ctaLabel: string;
  onOpen?: () => void;
  onShare?: () => void;
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
  onDelete,
}: Props) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium uppercase tracking-wide text-emerald-700">
          {badge}
        </span>
        {meta && <span>{meta}</span>}
      </div>
      <h3 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{desc}</p>
      <div className="mt-6 flex items-center gap-3 border-t pt-5">
        <button
          type="button"
          onClick={onOpen}
          className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700"
        >
          {ctaLabel}
        </button>
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Share
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="h-10 rounded-xl border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete bot
          </button>
        )}
      </div>
    </div>
  );
}
