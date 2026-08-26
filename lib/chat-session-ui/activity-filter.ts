/**
 * Activity list/export filters: source + last-activity UTC date range.
 * Query params: surface=public|editor-test, from=YYYY-MM-DD, to=YYYY-MM-DD.
 * from/to are inclusive UTC calendar days on session.updatedAt.
 */
import type { SessionSurface } from "@/lib/chat-session-store/types";

export type ActivityFilterQuery = {
  surface?: string | null;
  from?: string | null;
  to?: string | null;
};

export type ParsedActivityFilter = {
  surface?: SessionSurface;
  updatedFrom?: string;
  updatedTo?: string;
};

export type ActivityFilterParseResult =
  | { ok: true; filter: ParsedActivityFilter }
  | { ok: false; error: string };

export const ACTIVITY_FILTER_ERROR = "Invalid activity filter";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidUtcDateOnly(raw: string): boolean {
  const match = DATE_ONLY.exec(raw);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function utcDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

export function utcDayEndExclusiveIso(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function utcDateOnlyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

export function addUtcDateOnly(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateOnlyFromIso(date.toISOString());
}

export function lastNUtcDays(
  days: number,
  nowIso: string = new Date().toISOString()
): { from: string; to: string } {
  const to = utcDateOnlyFromIso(nowIso);
  return { from: addUtcDateOnly(to, -(days - 1)), to };
}

export function parseActivityFilter(
  query: ActivityFilterQuery = {}
): ActivityFilterParseResult {
  const surfaceRaw = typeof query.surface === "string" ? query.surface.trim() : "";
  let surface: SessionSurface | undefined;
  if (surfaceRaw) {
    if (surfaceRaw !== "public" && surfaceRaw !== "editor-test") {
      return { ok: false, error: ACTIVITY_FILTER_ERROR };
    }
    surface = surfaceRaw;
  }

  const fromRaw = typeof query.from === "string" ? query.from.trim() : "";
  const toRaw = typeof query.to === "string" ? query.to.trim() : "";
  if (fromRaw && !isValidUtcDateOnly(fromRaw)) {
    return { ok: false, error: ACTIVITY_FILTER_ERROR };
  }
  if (toRaw && !isValidUtcDateOnly(toRaw)) {
    return { ok: false, error: ACTIVITY_FILTER_ERROR };
  }
  if (fromRaw && toRaw && fromRaw > toRaw) {
    return { ok: false, error: ACTIVITY_FILTER_ERROR };
  }

  const filter: ParsedActivityFilter = {};
  if (surface) filter.surface = surface;
  if (fromRaw) filter.updatedFrom = utcDayStartIso(fromRaw);
  if (toRaw) filter.updatedTo = utcDayEndExclusiveIso(toRaw);
  return { ok: true, filter };
}

export function isActivityFilterActive(filter: ParsedActivityFilter): boolean {
  return Boolean(filter.surface || filter.updatedFrom || filter.updatedTo);
}

export function activityFilterQueryFromSearchParams(params: {
  get: (name: string) => string | null;
}): { surface: string; from: string; to: string } {
  return {
    surface: (params.get("surface") ?? "").trim(),
    from: (params.get("from") ?? "").trim(),
    to: (params.get("to") ?? "").trim(),
  };
}

export function matchesLastNUtcDays(
  from: string,
  to: string,
  days: number,
  nowIso?: string
): boolean {
  const expected = lastNUtcDays(days, nowIso);
  return from === expected.from && to === expected.to;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function utcDateParts(dateOnly: string): {
  year: number;
  monthIndex: number;
  day: number;
} {
  const year = Number(dateOnly.slice(0, 4));
  const monthIndex = Number(dateOnly.slice(5, 7)) - 1;
  const day = Number(dateOnly.slice(8, 10));
  return { year, monthIndex, day };
}

export function formatUtcDateShort(dateOnly: string): string {
  const { year, monthIndex, day } = utcDateParts(dateOnly);
  return `${MONTH_SHORT[monthIndex]} ${day}, ${year}`;
}

/** Display label for a UTC date-only range, e.g. "Aug 1 – Aug 25". */
export function formatUtcDateRangeLabel(from: string, to: string): string {
  if (!from && !to) return "";
  if (from && !to) return formatUtcDateShort(from);
  if (!from && to) return formatUtcDateShort(to);
  if (from === to) return formatUtcDateShort(from);
  const start = utcDateParts(from);
  const end = utcDateParts(to);
  if (start.year === end.year) {
    return `${MONTH_SHORT[start.monthIndex]} ${start.day} – ${MONTH_SHORT[end.monthIndex]} ${end.day}`;
  }
  return `${formatUtcDateShort(from)} – ${formatUtcDateShort(to)}`;
}

export function formatUtcMonthTitle(year: number, monthIndex: number): string {
  return `${MONTH_LONG[monthIndex]} ${year}`;
}

export type UtcMonthCell = { date: string; inMonth: boolean };

/** Monday-first month grid for a UTC calendar month (monthIndex 0–11). */
export function utcMonthCells(
  year: number,
  monthIndex: number
): UtcMonthCell[] {
  const first = `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const jsWeekday = new Date(`${first}T00:00:00.000Z`).getUTCDay();
  const mondayLead = (jsWeekday + 6) % 7;
  const cells: UtcMonthCell[] = [];
  for (let i = 0; i < mondayLead; i += 1) {
    cells.push({
      date: addUtcDateOnly(first, i - mondayLead),
      inMonth: false,
    });
  }
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: addUtcDateOnly(first, day - 1),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    if (!last) break;
    cells.push({ date: addUtcDateOnly(last.date, 1), inMonth: false });
  }
  return cells;
}

export function shiftUtcMonth(
  year: number,
  monthIndex: number,
  delta: number
): { year: number; monthIndex: number } {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}

export type ActivityHrefQuery = {
  session?: string | null;
  surface?: string | null;
  from?: string | null;
  to?: string | null;
};

export function buildActivitySearch(query: ActivityHrefQuery): string {
  const params = new URLSearchParams();
  const surface = query.surface?.trim();
  const from = query.from?.trim();
  const to = query.to?.trim();
  const session = query.session?.trim();
  if (surface) params.set("surface", surface);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (session) params.set("session", session);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}
