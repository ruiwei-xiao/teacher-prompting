"use client";

export default function ChatPrivacyControls({
  sharing,
  onToggle,
  busy = false,
}: {
  sharing: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-5 text-slate-600">
        {"Your conversation may be viewed by this bot's creator"}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium tracking-wide text-slate-500">
          Sharing {sharing ? "on" : "off"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={sharing}
          aria-label="Share this conversation with the bot creator"
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={onToggle}
          className={[
            "pressable relative h-6 w-11 shrink-0 rounded-full border-2",
            "transition-[background-color,border-color] duration-[var(--duration-press)] ease-[var(--ease-out)]",
            sharing
              ? "border-sky-200 bg-sky-400"
              : "border-rose-200/80 bg-rose-100",
            "disabled:cursor-wait",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm",
              "transition-transform duration-[var(--duration-press)] ease-[var(--ease-out)]",
              sharing ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}
