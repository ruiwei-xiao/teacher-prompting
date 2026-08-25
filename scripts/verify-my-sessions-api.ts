/**
 * Task-local verification for the participant-scoped session list API (task 3.2).
 * Injects store deps so the handler can be proven without Next HTTP.
 *
 * Run: npx tsx scripts/verify-my-sessions-api.ts
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
  const { listMySessions } = await import(
    "../lib/chat-session-api/my-sessions"
  );

  const userId = "user-1";
  const page = {
    items: [
      sampleSummary({
        id: "sess-unshared",
        shared: false,
        updatedAt: "2026-08-24T13:00:00.000Z",
      }),
      sampleSummary({
        id: "sess-editor",
        appId: "bot-own",
        appName: "Own bot",
        ownerId: userId,
        surface: "editor-test",
        updatedAt: "2026-08-24T12:30:00.000Z",
      }),
      sampleSummary({
        id: "sess-other-bot",
        appId: "bot-other",
        appName: "Someone else's bot",
        ownerId: "owner-2",
        updatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ],
    hasMore: true,
  };

  const checks: Check[] = [
    {
      name: "no user → 401 and does not list sessions",
      run: async () => {
        let listed = false;
        const result = await listMySessions(null, {}, {
          listSessionsForUser: async () => {
            listed = true;
            return page;
          },
        });
        assertEqual(result.status, 401, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Unauthorized" }, "body");
        }
        assertEqual(listed, false, "listSessionsForUser not called");
      },
    },
    {
      name: "signed-in user → listSessionsForUser result including unshared and editor-test",
      run: async () => {
        let seenUserId: string | undefined;
        let seenPaging: { limit: number; offset: number } | undefined;
        const result = await listMySessions(
          userId,
          { limit: "10", offset: "4" },
          {
            listSessionsForUser: async (id, opts) => {
              seenUserId = id;
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
          assert(
            result.body.sessions.some((s) => s.shared === false),
            "includes unshared sessions"
          );
          assert(
            result.body.sessions.some((s) => s.surface === "editor-test"),
            "includes editor-test sessions"
          );
        }
        assertEqual(seenUserId, userId, "listSessionsForUser participantId");
        assertEqual(seenPaging, { limit: 10, offset: 4 }, "explicit paging");
      },
    },
    {
      name: "default paging values when limit/offset omitted",
      run: async () => {
        let seenPaging: { limit: number; offset: number } | undefined;
        const result = await listMySessions(userId, {}, {
          listSessionsForUser: async (_id, opts) => {
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
          listSessionsForUser: async (
            _id: string,
            opts: { limit: number; offset: number }
          ) => {
            seen.push(opts);
            return { items: [], hasMore: false };
          },
        };
        await listMySessions(userId, { limit: "abc", offset: "-1" }, deps);
        await listMySessions(userId, { limit: "1.5", offset: "" }, deps);
        await listMySessions(userId, { limit: "0", offset: "3" }, deps);
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
      name: "route is a thin auth wrapper around listMySessions",
      run: async () => {
        const routePath = path.join(
          process.cwd(),
          "app/api/sessions/route.ts"
        );
        const source = await fs.readFile(routePath, "utf-8");
        assert(
          source.includes('from "@/auth"') && source.includes("auth()"),
          "route calls auth()"
        );
        assert(
          source.includes("listMySessions"),
          "route delegates to listMySessions"
        );
        assert(
          source.includes('searchParams.get("limit")') &&
            source.includes('searchParams.get("offset")'),
          "route forwards limit and offset"
        );
        assert(
          !source.includes("listSessionsForUser"),
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
