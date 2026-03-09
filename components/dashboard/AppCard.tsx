type Props = {
  title: string;
  desc: string;
  meta?: string;
  ctaLabel: string;
  onOpen?: () => void;
};

export default function AppCard({
  title,
  desc,
  meta,
  ctaLabel,
  onOpen,
}: Props) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium uppercase tracking-wide text-emerald-700">
          Example Bot
        </span>
        {meta && <span>{meta}</span>}
      </div>
      <h3 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
      <div className="mt-6 pt-5 border-t">
        <button
          onClick={onOpen}
          className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
