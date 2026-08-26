/**
 * Task-local verification for shared session list/transcript helpers (task 5.1).
 * Covers display labels, badges, empty vs items vs loading vs load-more,
 * client fetch URLs, and read-only transcript source constraints.
 *
 * Run: npx tsx scripts/verify-session-view-helpers.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  ChatSessionRecord,
  SessionSummary,
  StoredChatMessage,
} from "../lib/chat-session-store/types";

type Check = { name: string; run: () => void | Promise<void> };

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

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
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
    messageCount: 4,
    appExists: true,
    ...overrides,
  };
}

function sampleRecord(
  overrides: Partial<ChatSessionRecord> = {}
): ChatSessionRecord {
  const { messageCount: _count, appExists: _exists, ...base } = sampleSummary();
  return {
    ...base,
    messages: [
      { role: "user", content: "hello", at: "2026-08-24T12:00:00.000Z" },
      { role: "assistant", content: "hi", at: "2026-08-24T12:00:01.000Z" },
    ],
    ...overrides,
  };
}

async function main() {
  const display = await import("../components/sessions/session-display");
  const client = await import("../components/sessions/session-client");

  const checks: Check[] = [
    {
      name: "participant mode shows participantName",
      run: () => {
        assertEqual(
          display.sessionDisplayName(sampleSummary(), "participant"),
          "Ada",
          "named participant"
        );
      },
    },
    {
      name: "participant mode labels null/blank names Anonymous",
      run: () => {
        assertEqual(
          display.sessionDisplayName(
            sampleSummary({ participantName: null, participantId: null }),
            "participant"
          ),
          "Anonymous",
          "null name"
        );
        assertEqual(
          display.sessionDisplayName(
            sampleSummary({ participantName: "   " }),
            "participant"
          ),
          "Anonymous",
          "blank name"
        );
        assertEqual(
          display.transcriptParticipantLabel(null),
          "Anonymous",
          "transcript null"
        );
        assertEqual(
          display.transcriptParticipantLabel("  "),
          "Anonymous",
          "transcript blank"
        );
        assertEqual(
          display.transcriptParticipantLabel("Ada"),
          "Ada",
          "transcript named"
        );
      },
    },
    {
      name: "bot mode shows snapshotted appName",
      run: () => {
        assertEqual(
          display.sessionDisplayName(sampleSummary(), "bot"),
          "Tutor",
          "bot name"
        );
        assertEqual(
          display.sessionDisplayName(
            sampleSummary({
              participantName: null,
              appName: "Deleted snapshot",
              appExists: false,
            }),
            "bot"
          ),
          "Deleted snapshot",
          "snapshot survives deletion"
        );
      },
    },
    {
      name: "surface badges distinguish public chat and editor test",
      run: () => {
        assertEqual(
          display.sessionSurfaceBadge("public"),
          "Public chat",
          "public"
        );
        assertEqual(
          display.sessionSurfaceBadge("editor-test"),
          "Editor test",
          "editor-test"
        );
        assert(
          display.sessionBadgeClassName("Public chat") !==
            display.sessionBadgeClassName("Editor test"),
          "public and editor-test badges use different colors"
        );
      },
    },
    {
      name: "Not shared with owner badge when shared is false in any nameMode",
      run: () => {
        const unshared = sampleSummary({ shared: false });
        const shared = sampleSummary({ shared: true });
        assertEqual(
          display.sessionNotSharedBadge(unshared, "participant"),
          "Not shared with owner",
          "participant unshared"
        );
        assertEqual(
          display.sessionNotSharedBadge(shared, "participant"),
          null,
          "participant shared"
        );
        assertEqual(
          display.sessionNotSharedBadge(unshared, "bot"),
          "Not shared with owner",
          "bot-mode unshared (My sessions)"
        );
        assertEqual(
          display.sessionNotSharedBadge(shared, "bot"),
          null,
          "bot-mode shared"
        );
        assertEqual(
          display.sessionBadges(unshared, "participant"),
          ["Public chat", "Not shared with owner"],
          "participant unshared badges"
        );
        assertEqual(
          display.sessionBadges(unshared, "bot"),
          ["Public chat", "Not shared with owner"],
          "bot-mode unshared badges"
        );
      },
    },
    {
      name: "deleted-bot indication when appExists is false",
      run: () => {
        const gone = sampleSummary({
          appExists: false,
          surface: "editor-test",
        });
        assertEqual(
          display.sessionDeletedBotBadge(gone),
          "Bot no longer available",
          "deleted label"
        );
        assertEqual(
          display.sessionDeletedBotBadge(sampleSummary({ appExists: true })),
          null,
          "existing bot"
        );
        assertEqual(
          display.sessionBadges(gone, "bot"),
          ["Editor test", "Bot no longer available"],
          "bot-mode deleted badges"
        );
      },
    },
    {
      name: "empty vs items vs loading vs load-more list states",
      run: () => {
        assertEqual(
          display.sessionListViewState({ sessionCount: 0, loading: true }),
          "loading",
          "initial loading"
        );
        assertEqual(
          display.sessionListViewState({ sessionCount: 0, loading: false }),
          "empty",
          "empty"
        );
        assertEqual(
          display.sessionListViewState({ sessionCount: 3, loading: false }),
          "items",
          "items"
        );
        assertEqual(
          display.sessionListViewState({ sessionCount: 3, loading: true }),
          "items",
          "load-more in progress stays items"
        );
        assertEqual(
          display.sessionListShowsLoadMore({ hasMore: true, sessionCount: 3 }),
          true,
          "load more visible"
        );
        assertEqual(
          display.sessionListShowsLoadMore({ hasMore: true, sessionCount: 0 }),
          false,
          "no load more on empty"
        );
        assertEqual(
          display.sessionListShowsLoadMore({ hasMore: false, sessionCount: 3 }),
          false,
          "no load more when complete"
        );
      },
    },
    {
      name: "image-omitted messages use (image attached) placeholder",
      run: () => {
        const omitted: StoredChatMessage = {
          role: "user",
          content: "see this",
          at: "2026-08-24T12:00:00.000Z",
          imageOmitted: true,
        };
        const plain: StoredChatMessage = {
          role: "assistant",
          content: "ok",
          at: "2026-08-24T12:00:01.000Z",
        };
        assertEqual(
          display.transcriptImagePlaceholder(omitted),
          "(image attached)",
          "omitted"
        );
        assertEqual(
          display.transcriptImagePlaceholder(plain),
          null,
          "plain"
        );
      },
    },
    {
      name: "session-client builds owner, my-sessions, and transcript URLs",
      run: () => {
        assertEqual(
          client.ownerSessionsUrl("bot-1", { limit: 20, offset: 0 }),
          "/api/apps/bot-1/sessions?limit=20&offset=0",
          "owner url"
        );
        assertEqual(
          client.ownerSessionsUrl("bot/weird", { limit: 10, offset: 20 }),
          "/api/apps/bot%2Fweird/sessions?limit=10&offset=20",
          "owner url encodes appId"
        );
        assertEqual(
          client.mySessionsUrl({ limit: 20, offset: 40 }),
          "/api/sessions?limit=20&offset=40",
          "my sessions url"
        );
        assertEqual(
          client.transcriptUrl("sess-1"),
          "/api/sessions/sess-1",
          "transcript url"
        );
        assertEqual(
          client.transcriptUrl("sess/1"),
          "/api/sessions/sess%2F1",
          "transcript url encodes id"
        );
      },
    },
    {
      name: "fetchOwnerSessions parses list JSON via GET",
      run: async () => {
        const sessions = [sampleSummary()];
        let calledUrl = "";
        const result = await client.fetchOwnerSessions(
          "bot-1",
          { limit: 20, offset: 0 },
          async (input) => {
            calledUrl = String(input);
            return new Response(
              JSON.stringify({ sessions, hasMore: true }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        );
        assertEqual(calledUrl, "/api/apps/bot-1/sessions?limit=20&offset=0", "url");
        assertEqual(result.sessions, sessions, "sessions");
        assertEqual(result.hasMore, true, "hasMore");
      },
    },
    {
      name: "fetchMySessions parses list JSON via GET",
      run: async () => {
        const sessions = [sampleSummary({ shared: false })];
        const result = await client.fetchMySessions(
          { limit: 5, offset: 10 },
          async (input) => {
            assertEqual(
              String(input),
              "/api/sessions?limit=5&offset=10",
              "url"
            );
            return new Response(
              JSON.stringify({ sessions, hasMore: false }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        );
        assertEqual(result.sessions, sessions, "sessions");
        assertEqual(result.hasMore, false, "hasMore");
      },
    },
    {
      name: "fetchTranscript parses session record via GET",
      run: async () => {
        const session = sampleRecord();
        const result = await client.fetchTranscript(
          "sess-1",
          async (input) => {
            assertEqual(String(input), "/api/sessions/sess-1", "url");
            return new Response(JSON.stringify({ session }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        );
        assertEqual(result, session, "session");
      },
    },
    {
      name: "fetch helpers throw on non-OK API responses",
      run: async () => {
        await client
          .fetchMySessions({}, async () => {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
            });
          })
          .then(
            () => {
              throw new Error("expected fetchMySessions to throw");
            },
            (error: unknown) => {
              assert(
                error instanceof Error && /Unauthorized/.test(error.message),
                "my sessions error message"
              );
            }
          );
        await client
          .fetchTranscript("missing", async () => {
            return new Response(JSON.stringify({ error: "Session not found" }), {
              status: 404,
            });
          })
          .then(
            () => {
              throw new Error("expected fetchTranscript to throw");
            },
            (error: unknown) => {
              assert(
                error instanceof Error && /not found/i.test(error.message),
                "transcript error message"
              );
            }
          );
      },
    },
    {
      name: "SessionList source renders loading, empty, load-more, and selected state",
      run: async () => {
        const source = await readSource("components/sessions/SessionList.tsx");
        assert(source.includes("emptyMessage"), "emptyMessage prop");
        assert(source.includes("nameMode"), "nameMode prop");
        assert(source.includes("onLoadMore"), "onLoadMore prop");
        assert(source.includes("onSelect"), "onSelect prop");
        assert(
          source.includes("Load more") || source.includes("Load more"),
          "Load more label"
        );
        assert(
          /loading/i.test(source),
          "loading state is represented"
        );
        assert(
          source.includes("sessionListViewState") ||
            source.includes('=== "empty"') ||
            source.includes("emptyMessage"),
          "empty vs items branch"
        );
        assert(
          source.includes("aria-selected") || source.includes("aria-current"),
          "accessible selected state"
        );
        assert(
          source.includes("pressable"),
          "pressable list items"
        );
        assert(
          source.includes("hover-ok"),
          "hover-ok hover"
        );
        assert(
          source.includes("rounded-2xl"),
          "rounded-2xl craft"
        );
        assert(
          source.includes("dark:"),
          "dark variants"
        );
        assert(
          !/transition-\[.*background/.test(source) &&
            !source.includes("transition-colors") &&
            !source.includes("transition-all"),
          "no color/selection animation on list items"
        );
        assert(
          !/\bonDelete\b/.test(source) && !/\bonEdit\b/.test(source),
          "list has no edit/delete handlers"
        );
      },
    },
    {
      name: "SessionTranscript source is read-only ChatMessageBody with image placeholder",
      run: async () => {
        const source = await readSource(
          "components/sessions/SessionTranscript.tsx"
        );
        assert(
          source.includes("ChatMessageBody"),
          "uses existing ChatMessageBody"
        );
        assert(
          source.includes("(image attached)"),
          "image-omitted placeholder copy"
        );
        const lower = source.toLowerCase();
        assert(!lower.includes("delete"), "no delete string");
        assert(
          !/\bedit\b/.test(lower),
          "no edit string"
        );
        assert(
          !source.includes("contentEditable") &&
            !source.includes("contenteditable"),
          "not contenteditable"
        );
        assert(
          !/\bonDelete\b/.test(source) && !/\bonEdit\b/.test(source),
          "no mutation handlers"
        );
        assert(source.includes("dark:"), "dark variants");
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
