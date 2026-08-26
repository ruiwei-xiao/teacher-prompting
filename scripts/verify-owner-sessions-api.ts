/**
 * Task-local verification for the owner-scoped session list API (task 3.1).
 * Injects auth/store deps so the handler can be proven without Next HTTP.
 *
 * Run: npx tsx scripts/verify-owner-sessions-api.ts
 */
import fs from "fs/promises";
import path from "path";
import type { SessionSummary } from "../lib/chat-session-store/types";

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

function sampleSummary(
  overrides: Partial<SessionSummary> = {}
): SessionSummary {
  return {
    id: "sess-1",
    appId: "bot-1",
    appName: "Tutor",
    ownerId: "owner-1",
    participantId: "user-1",
    participantName: "Ada",
    surface: "public",
    shared: true,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:05:00.000Z",
    messageCount: 2,
    appExists: true,
    ...overrides,
  };
}

async function main() {
  const { listOwnerSessions } = await import(
    "../lib/chat-session-api/owner-sessions"
  );

  const ownerId = "owner-1";
  const appId = "bot-1";
  const page = {
    items: [
      sampleSummary({ id: "sess-new" }),
      sampleSummary({
        id: "sess-old",
        participantId: null,
        participantName: null,
        updatedAt: "2026-08-24T11:00:00.000Z",
      }),
    ],
    hasMore: true,
  };

  const checks: Check[] = [
    {
      name: "no user → 401 and does not load app or sessions",
      run: async () => {
        let loadedApp = false;
        let listed = false;
        const result = await listOwnerSessions(null, appId, {}, {
          getAppById: async () => {
            loadedApp = true;
            return { id: appId };
          },
          listSessionsForApp: async () => {
            listed = true;
            return page;
          },
        });
        assertEqual(result.status, 401, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Unauthorized" }, "body");
        }
        assertEqual(loadedApp, false, "getAppById not called");
        assertEqual(listed, false, "listSessionsForApp not called");
      },
    },
    {
      name: "non-owner / missing app → 404 and does not list sessions",
      run: async () => {
        let seenAppId: string | undefined;
        let seenOwnerId: string | undefined;
        let listed = false;
        const result = await listOwnerSessions(
          "intruder",
          appId,
          { limit: "10", offset: "0" },
          {
            getAppById: async (id, owner) => {
              seenAppId = id;
              seenOwnerId = owner;
              return null;
            },
            listSessionsForApp: async () => {
              listed = true;
              return page;
            },
          }
        );
        assertEqual(result.status, 404, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "App not found" }, "body");
        }
        assertEqual(seenAppId, appId, "getAppById id");
        assertEqual(seenOwnerId, "intruder", "getAppById owner filter");
        assertEqual(listed, false, "listSessionsForApp not called");
      },
    },
    {
      name: "owner → sessions + hasMore via listSessionsForApp",
      run: async () => {
        let seenAppId: string | undefined;
        let seenOwnerId: string | undefined;
        let seenListAppId: string | undefined;
        let seenPaging: { limit: number; offset: number } | undefined;
        const result = await listOwnerSessions(
          ownerId,
          appId,
          { limit: "10", offset: "4" },
          {
            getAppById: async (id, owner) => {
              seenAppId = id;
              seenOwnerId = owner;
              return { id: appId };
            },
            listSessionsForApp: async (id, opts) => {
              seenListAppId = id;
              seenPaging = opts;
              return page;
            },
          }
        );
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body.sessions, page.items, "sessions");
          assertEqual(result.body.hasMore, true, "hasMore");
          assertEqual(
            "items" in result.body,
            false,
            "response uses sessions, not items"
          );
        }
        assertEqual(seenAppId, appId, "ownership check appId");
        assertEqual(seenOwnerId, ownerId, "ownership check userId");
        assertEqual(seenListAppId, appId, "listSessionsForApp appId");
        assertEqual(seenPaging, { limit: 10, offset: 4 }, "explicit paging");
      },
    },
    {
      name: "default paging values when limit/offset omitted",
      run: async () => {
        let seenPaging: { limit: number; offset: number } | undefined;
        const result = await listOwnerSessions(ownerId, appId, {}, {
          getAppById: async () => ({ id: appId }),
          listSessionsForApp: async (_id, opts) => {
            seenPaging = opts;
            return { items: [], hasMore: false };
          },
        });
        assertEqual(result.status, 200, "status");
        if (result.ok) {
          assertEqual(result.body.sessions, [], "empty sessions");
          assertEqual(result.body.hasMore, false, "hasMore false");
        }
        assertEqual(
          seenPaging,
          { limit: 20, offset: 0 },
          "default limit 20 offset 0"
        );
      },
    },
    {
      name: "invalid limit/offset fall back to defaults",
      run: async () => {
        const seen: Array<{ limit: number; offset: number }> = [];
        const deps = {
          getAppById: async () => ({ id: appId }),
          listSessionsForApp: async (
            _id: string,
            opts: { limit: number; offset: number }
          ) => {
            seen.push(opts);
            return { items: [], hasMore: false };
          },
        };
        await listOwnerSessions(
          ownerId,
          appId,
          { limit: "abc", offset: "-1" },
          deps
        );
        await listOwnerSessions(
          ownerId,
          appId,
          { limit: "1.5", offset: "" },
          deps
        );
        await listOwnerSessions(
          ownerId,
          appId,
          { limit: "0", offset: "3" },
          deps
        );
        assertEqual(
          seen[0],
          { limit: 20, offset: 0 },
          "garbage and negative → defaults"
        );
        assertEqual(
          seen[1],
          { limit: 20, offset: 0 },
          "float and empty → defaults"
        );
        assertEqual(
          seen[2],
          { limit: 0, offset: 3 },
          "non-negative integers are kept"
        );
      },
    },
    {
      name: "invalid surface/from/to → 400 and does not list",
      run: async () => {
        let listed = false;
        const result = await listOwnerSessions(
          ownerId,
          appId,
          { surface: "left-chat" },
          {
            getAppById: async () => ({ id: appId }),
            listSessionsForApp: async () => {
              listed = true;
              return page;
            },
          }
        );
        assertEqual(result.status, 400, "status");
        if (!result.ok) {
          assertEqual(result.body, { error: "Invalid activity filter" }, "body");
        }
        assertEqual(listed, false, "listSessionsForApp not called");
      },
    },
    {
      name: "surface and date range are forwarded to listSessionsForApp",
      run: async () => {
        let seenOpts: unknown;
        const result = await listOwnerSessions(
          ownerId,
          appId,
          { surface: "public", from: "2026-08-01", to: "2026-08-25" },
          {
            getAppById: async () => ({ id: appId }),
            listSessionsForApp: async (_id, opts) => {
              seenOpts = opts;
              return { items: [], hasMore: false };
            },
          }
        );
        assertEqual(result.status, 200, "status");
        assertEqual(
          seenOpts,
          {
            limit: 20,
            offset: 0,
            surface: "public",
            updatedFrom: "2026-08-01T00:00:00.000Z",
            updatedTo: "2026-08-26T00:00:00.000Z",
          },
          "filter opts"
        );
      },
    },
    {
      name: "route is a thin auth wrapper around listOwnerSessions",
      run: async () => {
        const routePath = path.join(
          process.cwd(),
          "app/api/apps/[appId]/sessions/route.ts"
        );
        const source = await fs.readFile(routePath, "utf-8");
        assert(
          source.includes('from "@/auth"') && source.includes("auth()"),
          "route calls auth()"
        );
        assert(
          source.includes("listOwnerSessions"),
          "route delegates to listOwnerSessions"
        );
        assert(
          source.includes("searchParams.get(\"limit\")") &&
            source.includes("searchParams.get(\"offset\")") &&
            source.includes("searchParams.get(\"surface\")") &&
            source.includes("searchParams.get(\"from\")") &&
            source.includes("searchParams.get(\"to\")"),
          "route forwards paging and activity filters"
        );
        assert(
          !source.includes("getAppById") &&
            !source.includes("listSessionsForApp"),
          "route does not call store functions directly"
        );
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS  ${check.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL  ${check.name}`);
      console.error(`      ${message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${checks.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks.length} checks passed.`);
}

void main();
