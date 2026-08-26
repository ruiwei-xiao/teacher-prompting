"use client";

import type { ReactNode } from "react";
import DateRangePicker from "./DateRangePicker";

const FIELD =
  "h-9 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

export type ActivityFilterValue = {
  surface: string;
  from: string;
  to: string;
};

export default function ActivityFilters({
  value,
  onChange,
  trailing,
}: {
  value: ActivityFilterValue;
  onChange: (next: ActivityFilterValue) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <select
        className={FIELD}
        value={value.surface}
        onChange={(event) =>
          onChange({ ...value, surface: event.target.value })
        }
        aria-label="Filter by source"
      >
        <option value="">All sources</option>
        <option value="public">Public chat</option>
        <option value="editor-test">Editor test</option>
      </select>
      <DateRangePicker
        from={value.from}
        to={value.to}
        onChange={(from, to) => onChange({ ...value, from, to })}
      />
      {trailing ? <div className="ml-auto shrink-0">{trailing}</div> : null}
    </div>
  );
}
