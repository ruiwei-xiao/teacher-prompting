/**
 * Verification for activity source/date filter parsing (task 5.5).
 *
 * Run: npx tsx scripts/verify-activity-filter.ts
 */
import {
  addUtcDateOnly,
  buildActivitySearch,
  formatUtcDateRangeLabel,
  formatUtcMonthTitle,
  isValidUtcDateOnly,
  lastNUtcDays,
  parseActivityFilter,
  shiftUtcMonth,
  utcDayEndExclusiveIso,
  utcDayStartIso,
  utcMonthCells,
} from "../lib/chat-session-ui/activity-filter";

type Check = { name: string; run: () => void };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expected ${expectedJson}, received ${actualJson}`
    );
  }
}

function main() {
  const checks: Check[] = [
    {
      name: "UTC date-only validation",
      run: () => {
        assert(isValidUtcDateOnly("2026-08-25"), "valid");
        assertEqual(isValidUtcDateOnly("2026-02-31"), false, "impossible day");
        assertEqual(isValidUtcDateOnly("08-25-2026"), false, "wrong shape");
      },
    },
    {
      name: "inclusive from / exclusive next-day to",
      run: () => {
        assertEqual(
          utcDayStartIso("2026-08-01"),
          "2026-08-01T00:00:00.000Z",
          "start"
        );
        assertEqual(
          utcDayEndExclusiveIso("2026-08-25"),
          "2026-08-26T00:00:00.000Z",
          "end exclusive"
        );
        assertEqual(addUtcDateOnly("2026-08-31", 1), "2026-09-01", "month roll");
      },
    },
    {
      name: "last N UTC days is inclusive of today",
      run: () => {
        assertEqual(
          lastNUtcDays(7, "2026-08-25T18:00:00.000Z"),
          { from: "2026-08-19", to: "2026-08-25" },
          "7 days"
        );
      },
    },
    {
      name: "parseActivityFilter accepts source and dates",
      run: () => {
        const parsed = parseActivityFilter({
          surface: "public",
          from: "2026-08-01",
          to: "2026-08-25",
        });
        assert(parsed.ok, "ok");
        if (!parsed.ok) return;
        assertEqual(
          parsed.filter,
          {
            surface: "public",
            updatedFrom: "2026-08-01T00:00:00.000Z",
            updatedTo: "2026-08-26T00:00:00.000Z",
          },
          "filter"
        );
      },
    },
    {
      name: "parseActivityFilter rejects bad surface, dates, and inverted range",
      run: () => {
        assertEqual(parseActivityFilter({ surface: "builder" }).ok, false, "surface");
        assertEqual(parseActivityFilter({ from: "2026-13-01" }).ok, false, "from");
        assertEqual(
          parseActivityFilter({ from: "2026-08-25", to: "2026-08-01" }).ok,
          false,
          "inverted"
        );
      },
    },
    {
      name: "buildActivitySearch omits empty fields and keeps session",
      run: () => {
        assertEqual(buildActivitySearch({}), "", "empty");
        assertEqual(
          buildActivitySearch({
            surface: "public",
            from: "2026-08-01",
            to: "2026-08-25",
            session: "sess-1",
          }),
          "?surface=public&from=2026-08-01&to=2026-08-25&session=sess-1",
          "full"
        );
      },
    },
    {
      name: "UTC date-range labels and Monday-first month grid",
      run: () => {
        assertEqual(
          formatUtcDateRangeLabel("2026-08-01", "2026-08-25"),
          "Aug 1 – Aug 25",
          "same year"
        );
        assertEqual(
          formatUtcDateRangeLabel("2026-08-01", "2026-08-01"),
          "Aug 1, 2026",
          "single day"
        );
        assertEqual(
          formatUtcDateRangeLabel("2025-12-30", "2026-01-03"),
          "Dec 30, 2025 – Jan 3, 2026",
          "year boundary"
        );
        const august = utcMonthCells(2026, 7);
        assertEqual(august.length, 42, "six weeks");
        assertEqual(august[0], { date: "2026-07-27", inMonth: false }, "lead");
        assertEqual(august[5], { date: "2026-08-01", inMonth: true }, "Sat 1st");
        assertEqual(august[41], { date: "2026-09-06", inMonth: false }, "trail");
        assertEqual(
          shiftUtcMonth(2026, 11, 1),
          { year: 2027, monthIndex: 0 },
          "year roll"
        );
        assertEqual(formatUtcMonthTitle(2026, 7), "August 2026", "title");
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      check.run();
      console.log(`ok  ${check.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`fail ${check.name}: ${message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log(`\n${checks.length} check(s) passed`);
}

void main();
