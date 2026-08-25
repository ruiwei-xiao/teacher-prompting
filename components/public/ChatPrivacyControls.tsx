"use client";

export default function ChatPrivacyControls({
  sharing,
  onTurnOff,
}: {
  sharing: boolean;
  onTurnOff: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100/80 bg-gradient-to-r from-amber-50/80 via-white/70 to-sky-50/80 px-3 py-2">
      <p className="text-xs leading-5 text-slate-500">
        {"Your conversation may be viewed by this bot's creator"}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">
          Sharing {sharing ? "on" : "off"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={sharing}
          aria-label="Share this conversation with the bot creator"
          disabled={!sharing}
          onClick={onTurnOff}
          className={[
            "relative h-6 w-11 shrink-0 rounded-full border-2 transition",
            sharing
              ? "border-sky-200 bg-sky-400"
              : "border-rose-100 bg-rose-100",
            "disabled:cursor-not-allowed disabled:opacity-80",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition",
              sharing ? "right-0.5" : "left-0.5",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}
