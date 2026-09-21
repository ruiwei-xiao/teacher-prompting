/**
 * Task-local verification for attaching the visitor cookie when recording
 * published chat (task 3.3). Exercises the injectable resolver without a
 * live Next server, persists through recordChatTurn, and source-checks
 * the chat route.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-chat-recording.ts
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import type {
  AnonymousVisitorCookieStore,
  VisitorCookieOptions,
} from "../lib/public-chat-identity/cookie";
import type { ResolvePublicChatVisitorIdInput } from "../lib/public-chat-identity/resolve-public-chat-visitor";

type Check = { name: string; run: () => void | Promise<void> };

const VALID_VISITOR_ID = "550e8400-e29b-41d4-a716-446655440000";
const FORGED_VISITOR_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_PATH = "app/api/chat/route.ts";
const HELPER_PATH = "lib/public-chat-identity/resolve-public-chat-visitor.ts";

const now = "2026-09-21T18:00:00.000Z";
const publishedApp = {
  id: "bot-public-visitor",
  name: "Public Tutor",
  ownerId: "owner-1",
};
const incomingMessages = [
  {
    role: "user" as const,
    content: "Hello",
  },
];

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

type MemoryCookieStore = AnonymousVisitorCookieStore & {
  values: Map<string, string>;
  lastSet: {
    name: string;
    value: string;
    options: VisitorCookieOptions;
  } | null;
  setCount: number;
};

function createMemoryCookieStore(
  initial?: Record<string, string>
): MemoryCookieStore {
  const values = new Map<string, string>(Object.entries(initial ?? {}));
  const store: MemoryCookieStore = {
    values,
    lastSet: null,
    setCount: 0,
    get(name: string) {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name: string, value: string, options: VisitorCookieOptions) {
      values.set(name, value);
      store.lastSet = { name, value, options };
      store.setCount += 1;
    },
  };
  return store;
}

function forgedRecording(sessionId: string, surface: "public" | "editor-test") {
  return {
    sessionId,
    surface,
    anonymousVisitorId: FORGED_VISITOR_ID,
    visitorId: FORGED_VISITOR_ID,
    name: "Forged Name",
    email: "forged@example.com",
  };
}

async function main() {
  const dataFile = path.join(
    os.tmpdir(),
    `chat-sessions-visitor-recording-${process.pid}-${Date.now()}.json`
  );
  process.env.CHAT_SESSIONS_DATA_FILE = dataFile;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const cookie = await import("../lib/public-chat-identity/cookie");
  const { resolvePublicChatVisitorId } = await import(
    "../lib/public-chat-identity/resolve-public-chat-visitor"
  );
  const { recordChatTurn } = await import(
    "../lib/chat-session-store/record-chat-turn"
  );
  const { getSessionById } = await import("../lib/chat-session-store/store");
  const helperSource = await readSource(HELPER_PATH);
  const routeSource = await readSource(ROUTE_PATH);

  const checks: Check[] = [
    {
      name: "published request with a cookie stamps that visitor id",
      run: async () => {
        const sessionId = "chat-rec-existing-cookie";
        const store = createMemoryCookieStore({
          [cookie.ANONYMOUS_VISITOR_COOKIE]: VALID_VISITOR_ID,
        });
        const visitorId = await resolvePublicChatVisitorId({
          isPublishedRequest: true,
          store,
          secure: false,
          recording: forgedRecording(sessionId, "public"),
        });
        assertEqual(visitorId, VALID_VISITOR_ID, "resolved visitor id");
        assertEqual(store.setCount, 0, "existing cookie is not rewritten");

        const result = await recordChatTurn({
          recording: forgedRecording(sessionId, "public"),
          isPublishedRequest: true,
          userId: null,
          userName: null,
          anonymousVisitorId: visitorId,
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hello stranger",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected an anonymous public session");
        assertEqual(session.anonymousVisitorId, VALID_VISITOR_ID, "stamped id");
        assertEqual(session.participantId, null, "participantId");
        assertEqual(session.participantName, null, "participantName");
        assertEqual(session.surface, "public", "surface");
        const serialized = JSON.stringify(session);
        assert(
          !serialized.includes(FORGED_VISITOR_ID),
          "forged body id is not stored"
        );
        assert(
          !serialized.includes("Forged Name") &&
            !serialized.includes("forged@example.com"),
          "anonymous row stores no name or email"
        );
      },
    },
    {
      name: "published request with a missing cookie ensures one and stamps it",
      run: async () => {
        const sessionId = "chat-rec-missing-cookie";
        const store = createMemoryCookieStore();
        const visitorId = await resolvePublicChatVisitorId({
          isPublishedRequest: true,
          store,
          secure: true,
          recording: forgedRecording(sessionId, "public"),
        });
        assert(typeof visitorId === "string", "visitor id was issued");
        assert(
          cookie.isAnonymousVisitorId(visitorId),
          "issued id is a UUID v4"
        );
        assert(visitorId !== FORGED_VISITOR_ID, "issued id is not the forged body id");
        assertEqual(store.setCount, 1, "cookie written once");
        assertEqual(
          store.values.get(cookie.ANONYMOUS_VISITOR_COOKIE),
          visitorId,
          "cookie stores the issued id"
        );
        assertEqual(store.lastSet?.options.httpOnly, true, "HttpOnly");
        assertEqual(store.lastSet?.options.secure, true, "secure flag");

        const result = await recordChatTurn({
          recording: forgedRecording(sessionId, "public"),
          isPublishedRequest: true,
          userId: null,
          userName: "Should be ignored",
          anonymousVisitorId: visitorId,
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hello stranger",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected a session stamped with the issued id");
        assertEqual(session.anonymousVisitorId, visitorId, "stamped issued id");
        assertEqual(session.participantId, null, "participantId");
        assertEqual(session.participantName, null, "participantName");
      },
    },
    {
      name: "forged body visitor id is not used when a cookie is present",
      run: async () => {
        const store = createMemoryCookieStore({
          [cookie.ANONYMOUS_VISITOR_COOKIE]: VALID_VISITOR_ID,
        });
        const visitorId = await (
          resolvePublicChatVisitorId as (
            input: ResolvePublicChatVisitorIdInput & {
              anonymousVisitorId?: string;
              visitorId?: string;
            }
          ) => Promise<string | null>
        )({
          isPublishedRequest: true,
          store,
          secure: false,
          anonymousVisitorId: FORGED_VISITOR_ID,
          visitorId: FORGED_VISITOR_ID,
          recording: {
            anonymousVisitorId: FORGED_VISITOR_ID,
            visitorId: FORGED_VISITOR_ID,
          },
        });
        assertEqual(visitorId, VALID_VISITOR_ID, "cookie id wins");
        assertEqual(store.setCount, 0, "cookie was not replaced");
        assert(
          !helperSource.includes("recording.anonymousVisitorId") &&
            !helperSource.includes("recording?.anonymousVisitorId") &&
            !helperSource.includes("recording.visitorId") &&
            !helperSource.includes('recording["anonymousVisitorId"]') &&
            !helperSource.includes("recording['anonymousVisitorId']"),
          "helper does not read a visitor id from the recording body"
        );
      },
    },
    {
      name: "editor-test and other non-published requests do not stamp a visitor id",
      run: async () => {
        const sessionId = "chat-rec-editor-test";
        const store = createMemoryCookieStore({
          [cookie.ANONYMOUS_VISITOR_COOKIE]: VALID_VISITOR_ID,
        });
        const visitorId = await resolvePublicChatVisitorId({
          isPublishedRequest: false,
          store,
          secure: false,
          recording: forgedRecording(sessionId, "editor-test"),
        });
        assertEqual(visitorId, null, "non-published resolver result");
        assertEqual(store.setCount, 0, "editor-test does not write the cookie");
        assertEqual(
          store.values.get(cookie.ANONYMOUS_VISITOR_COOKIE),
          VALID_VISITOR_ID,
          "existing cookie is left unchanged"
        );

        const result = await recordChatTurn({
          recording: forgedRecording(sessionId, "editor-test"),
          isPublishedRequest: false,
          userId: publishedApp.ownerId,
          userName: "Owner",
          anonymousVisitorId: visitorId,
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Test reply",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected an editor-test session");
        assertEqual(session.surface, "editor-test", "surface");
        assertEqual(session.anonymousVisitorId, null, "editor-test visitor id");
        assertEqual(session.participantId, publishedApp.ownerId, "participantId");
        const serialized = JSON.stringify(session);
        assert(
          !serialized.includes(VALID_VISITOR_ID),
          "cookie visitor id is not stamped on editor-test"
        );
        assert(
          !serialized.includes(FORGED_VISITOR_ID),
          "forged body id is not stamped on editor-test"
        );

        const empty = createMemoryCookieStore();
        const issued = await resolvePublicChatVisitorId({
          isPublishedRequest: false,
          store: empty,
          secure: false,
        });
        assertEqual(issued, null, "missing cookie stays missing for editor-test");
        assertEqual(empty.setCount, 0, "editor-test does not ensure a cookie");
      },
    },
    {
      name: "signed-in published turn still receives the cookie visitor id",
      run: async () => {
        const sessionId = "chat-rec-signed-in-lineage";
        const store = createMemoryCookieStore({
          [cookie.ANONYMOUS_VISITOR_COOKIE]: VALID_VISITOR_ID,
        });
        const visitorId = await resolvePublicChatVisitorId({
          isPublishedRequest: true,
          userId: "learner-1",
          store,
          secure: false,
        });
        assertEqual(visitorId, VALID_VISITOR_ID, "resolved lineage visitor id");
        assertEqual(store.setCount, 0, "existing cookie is not rewritten");
        const result = await recordChatTurn({
          recording: { sessionId, surface: "public" },
          isPublishedRequest: true,
          userId: "learner-1",
          userName: "Ada",
          anonymousVisitorId: visitorId,
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hi Ada",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected a signed-in public session");
        assertEqual(session.participantId, "learner-1", "participantId");
        assertEqual(session.participantName, "Ada", "participantName");
        assertEqual(
          session.anonymousVisitorId,
          VALID_VISITOR_ID,
          "lineage visitor id"
        );
      },
    },
    {
      name: "signed-in published request with no cookie does not issue one",
      run: async () => {
        const sessionId = "chat-rec-signed-in-no-cookie";
        const store = createMemoryCookieStore();
        const visitorId = await resolvePublicChatVisitorId({
          isPublishedRequest: true,
          userId: "learner-native",
          store,
          secure: true,
          recording: forgedRecording(sessionId, "public"),
        });
        assertEqual(visitorId, null, "missing cookie stays null");
        assertEqual(store.setCount, 0, "signed-in does not set a cookie");

        const invalid = createMemoryCookieStore({
          [cookie.ANONYMOUS_VISITOR_COOKIE]: "not-a-uuid",
        });
        const invalidId = await resolvePublicChatVisitorId({
          isPublishedRequest: true,
          userId: "learner-native",
          store: invalid,
          secure: false,
        });
        assertEqual(invalidId, null, "invalid cookie stays null");
        assertEqual(invalid.setCount, 0, "invalid cookie is not replaced");

        const result = await recordChatTurn({
          recording: forgedRecording(sessionId, "public"),
          isPublishedRequest: true,
          userId: "learner-native",
          userName: "Ada",
          anonymousVisitorId: visitorId,
          app: publishedApp,
          messages: incomingMessages,
          assistantReply: "Hi Ada",
          now,
        });
        assertEqual(result.status, "persisted", "status");
        const session = await getSessionById(sessionId);
        assert(session, "expected a signed-in public session");
        assertEqual(session.anonymousVisitorId, null, "anonymousVisitorId");
        assertEqual(session.participantId, "learner-native", "participantId");
        assertEqual(session.participantName, "Ada", "participantName");
        const serialized = JSON.stringify(session);
        assert(
          !serialized.includes(FORGED_VISITOR_ID),
          "forged body id is not stored"
        );
      },
    },
    {
      name: "helper ensures only for published requests and does not use any",
      run: () => {
        const functionSource = helperSource.slice(
          helperSource.indexOf(
            "export async function resolvePublicChatVisitorId"
          )
        );
        const gateAt = functionSource.indexOf("!input.isPublishedRequest");
        const ensureAt = functionSource.indexOf("ensureAnonymousVisitorCookie");
        assert(gateAt !== -1, "helper gates on isPublishedRequest");
        assert(
          ensureAt !== -1 && gateAt < ensureAt,
          "non-published returns before cookie ensure"
        );
        assert(
          helperSource.includes("ensureAnonymousVisitorCookieOnStore"),
          "injectable store uses ensureAnonymousVisitorCookieOnStore"
        );
        assert(
          helperSource.includes("ensureAnonymousVisitorCookie("),
          "request path uses ensureAnonymousVisitorCookie"
        );
        assert(
          functionSource.includes("userId") &&
            functionSource.includes("readAnonymousVisitorId"),
          "signed-in published turns read the cookie and do not issue one"
        );
        assert(!/\bany\b/.test(helperSource), "helper does not use any");
      },
    },
    {
      name: "chat route resolves the cookie id and does not read one from the body",
      run: () => {
        assert(
          routeSource.includes(
            'from "@/lib/public-chat-identity/resolve-public-chat-visitor"'
          ),
          "route imports the visitor resolver"
        );
        assert(
          routeSource.includes("await resolvePublicChatVisitorId("),
          "route awaits resolvePublicChatVisitorId"
        );
        const resolveCall = routeSource.match(
          /resolvePublicChatVisitorId\(\s*\{([\s\S]*?)\}\s*\)/
        );
        assert(resolveCall, "route calls resolvePublicChatVisitorId with an object");
        const resolveArgs = resolveCall[1] ?? "";
        assert(
          resolveArgs.includes("isPublishedRequest"),
          "route passes isPublishedRequest"
        );
        assert(
          resolveArgs.includes("userId"),
          "route passes the signed-in user id"
        );
        assert(
          !resolveArgs.includes("recording") &&
            !resolveArgs.includes("visitorId") &&
            !resolveArgs.includes("anonymousVisitorId"),
          "route does not pass the recording body or a visitor id into the resolver"
        );
        const recordCall = routeSource.match(
          /recordChatTurn\(\s*\{([\s\S]*?)\}\s*\)/
        );
        assert(recordCall, "route calls recordChatTurn");
        const recordArgs = recordCall[1] ?? "";
        assert(
          recordArgs.includes("anonymousVisitorId"),
          "recordChatTurn receives anonymousVisitorId"
        );
        assert(
          !/recording\??\.(anonymousVisitorId|visitorId)/.test(routeSource) &&
            !/recording\s*\[\s*["']anonymousVisitorId["']\s*\]/.test(routeSource) &&
            !/recording\s*\[\s*["']visitorId["']\s*\]/.test(routeSource),
          "route never reads a visitor id from the recording body"
        );
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
