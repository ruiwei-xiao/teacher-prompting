"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  formatUtcDateRangeLabel,
  formatUtcMonthTitle,
  shiftUtcMonth,
  utcDateOnlyFromIso,
  utcMonthCells,
} from "@/lib/chat-session-ui/activity-filter";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function orderedRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

function monthFromDateOnly(dateOnly: string): {
  year: number;
  monthIndex: number;
} {
  return {
    year: Number(dateOnly.slice(0, 4)),
    monthIndex: Number(dateOnly.slice(5, 7)) - 1,
  };
}

export default function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const dialogId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const today = utcDateOnlyFromIso(new Date().toISOString());
  const [view, setView] = useState(() =>
    monthFromDateOnly(from || to || today)
  );

  useEffect(() => {
    if (!open) return;
    setPendingStart(null);
    setHoverDate(null);
    setView(monthFromDateOnly(from || to || today));
    // Snapshot the visible month only when the popover opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- from/to/today are read at open
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [from, to]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const label = formatUtcDateRangeLabel(from, to);
  const preview = pendingStart
    ? orderedRange(pendingStart, hoverDate ?? pendingStart)
    : from && to
      ? { from, to }
      : null;
  const cells = utcMonthCells(view.year, view.monthIndex);
  const hasRange = Boolean(from || to);

  function pickDay(date: string) {
    if (!pendingStart) {
      setPendingStart(date);
      setHoverDate(date);
      return;
    }
    const range = orderedRange(pendingStart, date);
    onChange(range.from, range.to);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={[
          "flex h-9 min-w-[16.5rem] items-center rounded-xl border bg-white dark:bg-zinc-900",
          open
            ? "border-sky-300 dark:border-sky-500/60"
            : "border-slate-300 dark:border-zinc-600",
        ].join(" ")}
      >
        <button
          ref={triggerRef}
          type="button"
          className="pressable flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={dialogId}
          onClick={() => setOpen((value) => !value)}
        >
          <Calendar
            className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span
            className={
              label
                ? "truncate text-slate-800 dark:text-zinc-100"
                : "truncate text-slate-400 dark:text-zinc-500"
            }
          >
            {label || "Select date range"}
          </span>
        </button>
        {hasRange ? (
          <button
            type="button"
            className="pressable mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover-ok:bg-slate-100 dark:text-zinc-400 dark:hover-ok:bg-zinc-800"
            aria-label="Clear date range"
            onClick={() => {
              setOpen(false);
              onChange("", "");
            }}
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Select date range"
          className="absolute left-0 z-50 mt-1.5 w-[18.5rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="pressable inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover-ok:bg-slate-100 dark:text-zinc-300 dark:hover-ok:bg-zinc-800"
              aria-label="Previous month"
              onClick={() => setView((current) => shiftUtcMonth(current.year, current.monthIndex, -1))}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
            <p className="text-sm font-medium text-slate-800 dark:text-zinc-100">
              {formatUtcMonthTitle(view.year, view.monthIndex)}
            </p>
            <button
              type="button"
              className="pressable inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover-ok:bg-slate-100 dark:text-zinc-300 dark:hover-ok:bg-zinc-800"
              aria-label="Next month"
              onClick={() => setView((current) => shiftUtcMonth(current.year, current.monthIndex, 1))}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500 dark:text-zinc-400">
            {pendingStart
              ? "Select the end date"
              : "Select the start date, then the end date"}
          </p>
          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {WEEKDAYS.map((day, index) => (
              <span
                key={`${day}-${index}`}
                className="pb-1 text-[11px] font-medium text-slate-400 dark:text-zinc-500"
              >
                {day}
              </span>
            ))}
            {cells.map((cell) => {
              const isStart = preview?.from === cell.date;
              const isEnd = preview?.to === cell.date;
              const inRange = Boolean(
                preview && cell.date > preview.from && cell.date < preview.to
              );
              const isToday = cell.date === today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onMouseEnter={() => {
                    if (pendingStart) setHoverDate(cell.date);
                  }}
                  onFocus={() => {
                    if (pendingStart) setHoverDate(cell.date);
                  }}
                  onClick={() => pickDay(cell.date)}
                  aria-label={cell.date}
                  aria-pressed={isStart || isEnd}
                  className={[
                    "h-9 text-sm",
                    cell.inMonth
                      ? "text-slate-800 dark:text-zinc-100"
                      : "text-slate-400 dark:text-zinc-500",
                    isStart && isEnd
                      ? "rounded-lg bg-sky-600 font-medium text-white dark:bg-sky-500"
                      : isStart
                        ? "rounded-l-lg bg-sky-600 font-medium text-white dark:bg-sky-500"
                        : isEnd
                          ? "rounded-r-lg bg-sky-600 font-medium text-white dark:bg-sky-500"
                          : inRange
                            ? "bg-sky-50 dark:bg-sky-950/50"
                            : "rounded-lg hover-ok:bg-slate-100 dark:hover-ok:bg-zinc-800",
                    isToday && !isStart && !isEnd
                      ? "font-semibold ring-1 ring-inset ring-sky-300 dark:ring-sky-500/60"
                      : "",
                  ].join(" ")}
                >
                  {Number(cell.date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
