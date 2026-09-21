/**
 * Task-local verification for owner activity CSV/JSON export.
 * Injects store deps so the handler can be proven without Next HTTP.
 *
 * Run: npx tsx scripts/verify-activity-export.ts
 */
import fs from "fs/promises";
import path from "path";
import type { ChatSessionRecord } from "../lib/chat-session-store/types";
import { activityExportHref } from "../lib/chat-session-ui/nav";

type Check = { name: string; run: () => Promise<void> };

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

const EXPECTED_CSV_COLUMNS = [
  "sessionId",
  "appId",
  "appName",
  "surface",
  "participantId",
  "participantName",
  "anonymousVisitorId",
  "createdAt",
  "updatedAt",
  "messageIndex",
  "role",
  "content",
  "messageAt",
  "imageOmitted",
] as const;

function sampleSession(
  overrides: Partial<ChatSessionRecord> = {}
): ChatSessionRecord {
  return {
    id: "sess-1",
    appId: "bot-1",
    appName: "Tutor",
    ownerId: "owner-1",
    participantId: "user-1",
    participantName: "Ada",
    surface: "public",
    shared: true,
    messages: [
      {
        role: "user",
        content: "hello",
        at: "2026-08-24T12:00:00.000Z",
      },
      {
        role: "assistant",
        content: "hi",
        at: "2026-08-24T12:00:01.000Z",
      },
    ],
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:05:00.000Z",
    ...overrides,
  };
}

function csvLines(csv: string): string[] {
  return csv.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
}

function csvRowByName(header: string[], line: string): Record<string, string> {
  const cells = line.split(",");
  const row: Record<string, string> = {};
  for (let i = 0; i < header.length; i += 1) {
    row[header[i] ?? ""] = cells[i] ?? "";
  }
  return row;
}

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
}

async function main() {
  const {
    CSV_COLUMNS,
    csvCell,
    exportOwnerSessions,
    parseExportFormat,
    sanitizeExportBasename,
    sessionsToCsv,
    sessionsToJson,
  } = await import("../lib/chat-session-api/export");

  const ownerId = "owner-1";
  const appId = "bot-1";
  const now = "2026-08-25T18:00:00.000Z";
  const shared = sampleSession();
  const unshared = sampleSession({
    id: "sess-private",
    shared: false,
    participantName: "Bea",
  });
  const anonymous = sampleSession({
    id: "sess-anon",
    participantId: null,
    participantName: null,
    messages: [
      {
        role: "user",
        content: 'He said "hello", then left',
        at: "2026-08-24T12:00:00.000Z",
        imageOmitted: true,
      },
    ],
  });
  const visitorA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const visitorB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const visitorClaimed = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const unattributedA = sampleSession({
    id: "sess-visitor-a",
    participantId: null,
    participantName: null,
    anonymousVisitorId: visitorA,
    messages: [
      {
        role: "user",
        content: "from-a",
        at: "2026-08-24T12:00:00.000Z",
      },
    ],
  });
  const unattributedB = sampleSession({
    id: "sess-visitor-b",
    participantId: null,
    participantName: null,
    anonymousVisitorId: visitorB,
    messages: [
      {
        role: "user",
        content: "from-b",
        at: "2026-08-24T12:00:00.000Z",
      },
    ],
  });
  const attributed = sampleSession({
    id: "sess-attributed",
    participantId: "user-1",
    participantName: "Ada",
    anonymousVisitorId: visitorClaimed,
    messages: [
      {
        role: "user",
        content: "claimed",
        at: "2026-08-24T12:00:00.000Z",
      },
    ],
  });
  const signedInNoCookie = sampleSession({
    id: "sess-native",
    participantId: "user-2",
    participantName: "Bea",
    messages: [
      {
        role: "user",
        content: "native",
        at: "2026-08-24T12:00:00.000Z",
      },
    ],
  });

  const checks: Check[] = [
    {
      name: "parseExportFormat accepts csv/json only",
      run: async () => {
        assertEqual(parseExportFormat("csv"), "csv", "csv");
        assertEqual(parseExportFormat("json"), "json", "json");
        assertEqual(parseExportFormat("xml"), null, "xml");
        assertEqual(parseExportFormat(""), null, "empty");
        assertEqual(parseExportFormat(null), null, "null");
      },
    },
    {
      name: "sanitizeExportBasename strips unsafe filename characters",
      run: async () => {
        assertEqual(
          sanitizeExportBasename("My Tutor!"),
          "My-Tutor",
          "punctuation"
        );
        assertEqual(sanitizeExportBasename("   "), "activity", "blank");
        assertEqual(
          sanitizeExportBasename("日本語ボット"),
          "activity",
          "non-ascii becomes fallback"
        );
      },
    },
    {
      name: "csvCell quotes commas, quotes, and newlines",
      run: async () => {
        assertEqual(csvCell("plain"), "plain", "plain");
        assertEqual(csvCell("a,b"), '"a,b"', "comma");
        assertEqual(csvCell('He said "hi"'), '"He said ""hi"""', "quotes");
        assertEqual(csvCell("line\nbreak"), '"line\nbreak"', "newline");
      },
    },
    {
      name: "sessionsToCsv is one row per message with a UTF-8 BOM",
      run: async () => {
        const csv = sessionsToCsv([shared, anonymous]);
        assert(csv.startsWith("\uFEFF"), "BOM prefix");
        const lines = csvLines(csv);
        assertEqual(lines[0], CSV_COLUMNS.join(","), "header");
        assertEqual(
          lines[0],
          EXPECTED_CSV_COLUMNS.join(","),
          "header includes anonymousVisitorId"
        );
        assertEqual(lines.length, 4, "header plus three message rows");
        assert(
          lines[1]?.startsWith("sess-1,bot-1,Tutor,public,user-1,Ada,,"),
          "signed-in first message with empty visitor id"
        );
        assert(
          lines[1]?.includes(",0,user,hello,") &&
            lines[2]?.includes(",1,assistant,hi,"),
          "message indexes and roles"
        );
        assert(
          lines[3]?.includes("sess-anon") &&
            lines[3]?.includes(",Anonymous,") &&
            lines[3]?.includes('"He said ""hello"", then left"') &&
            lines[3]?.endsWith(",true"),
          "anonymous name, escaped content, imageOmitted"
        );
        assertEqual(
          lines[3]?.includes("user-1"),
          false,
          "anonymous participantId is empty"
        );
      },
    },
    {
      name: "empty CSV still has the header row",
      run: async () => {
        const csv = sessionsToCsv([]);
        assertEqual(
          csv,
          `\uFEFF${EXPECTED_CSV_COLUMNS.join(",")}\r\n`,
          "header-only CSV"
        );
      },
    },
    {
      name: "CSV_COLUMNS places anonymousVisitorId after participantName",
      run: async () => {
        assertEqual(
          [...CSV_COLUMNS],
          [...EXPECTED_CSV_COLUMNS],
          "CSV_COLUMNS"
        );
      },
    },
    {
      name: "unattributed visitors stay Anonymous and have distinct visitor ids",
      run: async () => {
        const csv = sessionsToCsv([unattributedA, unattributedB]);
        const lines = csvLines(csv);
        const header = lines[0]?.split(",") ?? [];
        assert(
          header.includes("anonymousVisitorId"),
          "header includes visitor-id column"
        );
        const rowA = csvRowByName(header, lines[1] ?? "");
        const rowB = csvRowByName(header, lines[2] ?? "");
        assertEqual(rowA.sessionId, "sess-visitor-a", "visitor A session");
        assertEqual(rowB.sessionId, "sess-visitor-b", "visitor B session");
        assertEqual(rowA.participantId, "", "unattributed A participantId");
        assertEqual(rowB.participantId, "", "unattributed B participantId");
        assertEqual(rowA.participantName, "Anonymous", "unattributed A name");
        assertEqual(rowB.participantName, "Anonymous", "unattributed B name");
        assertEqual(rowA.anonymousVisitorId, visitorA, "visitor A id");
        assertEqual(rowB.anonymousVisitorId, visitorB, "visitor B id");
        assert(
          rowA.anonymousVisitorId !== rowB.anonymousVisitorId,
          "two unattributed visitors differ"
        );
      },
    },
    {
      name: "attributed CSV rows match signed-in participant fields",
      run: async () => {
        const csv = sessionsToCsv([
          shared,
          attributed,
          signedInNoCookie,
          unattributedA,
        ]);
        const lines = csvLines(csv);
        const header = lines[0]?.split(",") ?? [];
        const rows = lines.slice(1).map((line) => csvRowByName(header, line));
        const signedInRow = rows.find((row) => row.sessionId === "sess-1");
        const attributedRow = rows.find(
          (row) => row.sessionId === "sess-attributed"
        );
        const nativeRow = rows.find((row) => row.sessionId === "sess-native");
        const unattributedRow = rows.find(
          (row) => row.sessionId === "sess-visitor-a"
        );
        assert(signedInRow, "signed-in row present");
        assert(attributedRow, "attributed row present");
        assert(nativeRow, "native signed-in row present");
        assert(unattributedRow, "unattributed row present");
        assertEqual(
          attributedRow.participantId,
          signedInRow.participantId,
          "attributed participantId matches signed-in account id"
        );
        assertEqual(
          attributedRow.participantName,
          signedInRow.participantName,
          "attributed participantName matches signed-in display name"
        );
        assertEqual(
          attributedRow.anonymousVisitorId,
          visitorClaimed,
          "attributed visitor id filled when present"
        );
        assertEqual(
          nativeRow.participantId,
          "user-2",
          "native signed-in participantId"
        );
        assertEqual(
          nativeRow.participantName,
          "Bea",
          "native signed-in display name"
        );
        assertEqual(
          nativeRow.anonymousVisitorId,
          "",
          "native signed-in with no cookie has empty visitor id"
        );
        assertEqual(
          unattributedRow.participantId,
          "",
          "unattributed stays empty participantId"
        );
        assertEqual(
          unattributedRow.participantName,
          "Anonymous",
          "unattributed stays Anonymous"
        );
      },
    },
    {
      name: "sessionsToJson wraps metadata and full records",
      run: async () => {
        const json = sessionsToJson({
          appId,
          appName: "Tutor",
          exportedAt: now,
          filter: { surface: null, from: null, to: null },
          sessions: [shared],
        });
        const parsed = JSON.parse(json) as {
          appId: string;
          sessions: ChatSessionRecord[];
        };
        assertEqual(parsed.appId, appId, "appId");
        assertEqual(parsed.sessions[0]?.messages.length, 2, "full transcript");
      },
    },
    {
      name: "JSON export includes anonymousVisitorId on records",
      run: async () => {
        const json = sessionsToJson({
          appId,
          appName: "Tutor",
          exportedAt: now,
          filter: { surface: null, from: null, to: null },
          sessions: [unattributedA, attributed, signedInNoCookie],
        });
        const parsed = JSON.parse(json) as {
          sessions: ChatSessionRecord[];
        };
        assertEqual(
          parsed.sessions[0]?.anonymousVisitorId,
          visitorA,
          "unattributed JSON visitor id"
        );
        assertEqual(parsed.sessions[0]?.participantId, null, "JSON participantId");
        assertEqual(
          parsed.sessions[0]?.participantName,
          null,
          "JSON participantName stays null for unattributed"
        );
        assertEqual(
          parsed.sessions[1]?.participantId,
          "user-1",
          "attributed JSON account id"
        );
        assertEqual(
          parsed.sessions[1]?.participantName,
          "Ada",
          "attributed JSON display name"
        );
        assertEqual(
          parsed.sessions[1]?.anonymousVisitorId,
          visitorClaimed,
          "attributed JSON visitor id"
        );
        assertEqual(
          parsed.sessions[2]?.participantId,
          "user-2",
          "native JSON account id"
        );
        assertEqual(
          parsed.sessions[2]?.participantName,
          "Bea",
          "native JSON display name"
        );
        assertEqual(
          parsed.sessions[2]?.anonymousVisitorId,
          null,
          "native JSON visitor id is null when absent"
        );
      },
    },
    {
      name: "no user → 401 and does not load app or sessions",
      run: async () => {
        let loadedApp = false;
        let listed = false;
        const result = await exportOwnerSessions(null, appId, "csv", {
          getAppById: async () => {
            loadedApp = true;
            return { id: appId, name: "Tutor" };
          },
          listSharedSessionRecordsForApp: async () => {
            listed = true;
            return [shared];
          },
        });
        assertEqual(result.status, 401, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Unauthorized" }, "body");
        }
        assertEqual(loadedApp, false, "getAppById not called");
        assertEqual(listed, false, "list not called");
      },
    },
    {
      name: "non-owner / missing app → 404 and does not list sessions",
      run: async () => {
        let listed = false;
        const result = await exportOwnerSessions("intruder", appId, "csv", {
          getAppById: async () => null,
          listSharedSessionRecordsForApp: async () => {
            listed = true;
            return [shared];
          },
        });
        assertEqual(result.status, 404, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "App not found" }, "body");
        }
        assertEqual(listed, false, "list not called");
      },
    },
    {
      name: "invalid format → 400 before listing",
      run: async () => {
        let listed = false;
        const result = await exportOwnerSessions(ownerId, appId, "xml", {
          getAppById: async () => ({ id: appId, name: "Tutor" }),
          listSharedSessionRecordsForApp: async () => {
            listed = true;
            return [shared];
          },
        });
        assertEqual(result.status, 400, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Invalid export format" }, "body");
        }
        assertEqual(listed, false, "list not called");
      },
    },
    {
      name: "CSV export drops leaked unshared rows and names the file",
      run: async () => {
        let seenAppId: string | undefined;
        let seenOwnerId: string | undefined;
        const result = await exportOwnerSessions(ownerId, appId, "csv", {
          now,
          getAppById: async (id, owner) => {
            seenAppId = id;
            seenOwnerId = owner;
            return { id: appId, name: "Tutor" };
          },
          listSharedSessionRecordsForApp: async () => [shared, unshared],
        });
        assertEqual(seenAppId, appId, "app id");
        assertEqual(seenOwnerId, ownerId, "owner id");
        assert(result.ok, "ok");
        if (!result.ok) return;
        assertEqual(result.status, 200, "status");
        assertEqual(
          result.body.filename,
          "Tutor-activity-2026-08-25.csv",
          "filename"
        );
        assertEqual(
          result.body.contentType,
          "text/csv; charset=utf-8",
          "content type"
        );
        assert(
          result.body.body.includes("sess-1"),
          "includes shared session"
        );
        assertEqual(
          result.body.body.includes("sess-private"),
          false,
          "excludes unshared even if the store leaked it"
        );
      },
    },
    {
      name: "JSON export includes shared records only",
      run: async () => {
        const result = await exportOwnerSessions(ownerId, appId, "json", {
          now,
          getAppById: async () => ({ id: appId, name: "Tutor" }),
          listSharedSessionRecordsForApp: async () => [shared, unshared],
        });
        assert(result.ok, "ok");
        if (!result.ok) return;
        assertEqual(
          result.body.filename,
          "Tutor-activity-2026-08-25.json",
          "filename"
        );
        const parsed = JSON.parse(result.body.body) as {
          appId: string;
          appName: string;
          exportedAt: string;
          filter: { surface: string | null; from: string | null; to: string | null };
          sessions: ChatSessionRecord[];
        };
        assertEqual(parsed.appName, "Tutor", "appName");
        assertEqual(parsed.exportedAt, now, "exportedAt");
        assertEqual(
          parsed.filter,
          { surface: null, from: null, to: null },
          "empty filter metadata"
        );
        assertEqual(parsed.sessions.map((s) => s.id), ["sess-1"], "ids");
      },
    },
    {
      name: "invalid activity filter → 400 before listing",
      run: async () => {
        let listed = false;
        const result = await exportOwnerSessions(
          ownerId,
          appId,
          "csv",
          {
            getAppById: async () => ({ id: appId, name: "Tutor" }),
            listSharedSessionRecordsForApp: async () => {
              listed = true;
              return [shared];
            },
          },
          { surface: "left-chat" }
        );
        assertEqual(result.status, 400, "status");
        if (!result.ok) {
          assertEqual(result.body, { error: "Invalid activity filter" }, "body");
        }
        assertEqual(listed, false, "list not called");
      },
    },
    {
      name: "export passes source and date filters to the store",
      run: async () => {
        let seenFilter: unknown;
        const result = await exportOwnerSessions(
          ownerId,
          appId,
          "json",
          {
            now,
            getAppById: async () => ({ id: appId, name: "Tutor" }),
            listSharedSessionRecordsForApp: async (_id, filter) => {
              seenFilter = filter;
              return [shared];
            },
          },
          { surface: "public", from: "2026-08-01", to: "2026-08-25" }
        );
        assert(result.ok, "ok");
        assertEqual(
          seenFilter,
          {
            surface: "public",
            updatedFrom: "2026-08-01T00:00:00.000Z",
            updatedTo: "2026-08-26T00:00:00.000Z",
          },
          "store filter"
        );
        if (!result.ok) return;
        const parsed = JSON.parse(result.body.body) as {
          filter: { surface: string | null; from: string | null; to: string | null };
        };
        assertEqual(
          parsed.filter,
          { surface: "public", from: "2026-08-01", to: "2026-08-25" },
          "json filter echo"
        );
      },
    },
    {
      name: "activity view links CSV and JSON downloads",
      run: async () => {
        const source = await readSource(
          "components/sessions/BotActivityView.tsx"
        );
        assert(
          source.includes("activityExportHref"),
          "uses activityExportHref"
        );
        assert(source.includes("Download CSV"), "CSV label");
        assert(source.includes("Download JSON"), "JSON label");
        assert(
          source.includes("Shared sessions only"),
          "privacy caption"
        );
        assertEqual(
          activityExportHref("bot-1", "csv"),
          "/api/apps/bot-1/sessions/export?format=csv",
          "csv href"
        );
        assertEqual(
          activityExportHref("bot-1", "json", {
            surface: "public",
            from: "2026-08-01",
            to: "2026-08-25",
          }),
          "/api/apps/bot-1/sessions/export?format=json&surface=public&from=2026-08-01&to=2026-08-25",
          "filtered href"
        );
      },
    },
    {
      name: "export route is an authenticated attachment GET",
      run: async () => {
        const source = await readSource(
          "app/api/apps/[appId]/sessions/export/route.ts"
        );
        assert(source.includes("exportOwnerSessions"), "calls handler");
        assert(source.includes("auth()"), "calls auth()");
        assert(
          source.includes("Content-Disposition") &&
            source.includes("attachment"),
          "attachment disposition"
        );
        assert(source.includes("Cache-Control"), "no-store cache");
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
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
