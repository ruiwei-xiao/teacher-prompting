/**
 * Task-local verification for the sharing opt-out API (task 3.4).
 * Injects store deps so the handler can be proven without Next HTTP.
 *
 * Run: npx tsx scripts/verify-sharing-api.ts
 */
import fs from "fs/promises";
import path from "path";
import type { ChatSessionRecord } from "../lib/chat-session-store/types";

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

function createFakeStore(initial: ChatSessionRecord | null) {
  let current: ChatSessionRecord | null = initial
    ? { ...initial, messages: [...initial.messages] }
    : null;
  const disableIds: string[] = [];
  const discardIds: string[] = [];
  const loadIds: string[] = [];

  return {
    get current() {
      return current;
    },
    disableIds,
    discardIds,
    loadIds,
    getSessionById: async (id: string) => {
      loadIds.push(id);
      if (!current || current.id !== id) return null;
      return current;
    },
    disableSharing: async (id: string) => {
      disableIds.push(id);
      if (current && current.id === id) {
        current = { ...current, shared: false };
      }
    },
    discardSession: async (id: string) => {
      discardIds.push(id);
      if (current && current.id === id) {
        current = null;
      }
    },
  };
}

async function main() {
  const { optOutSharing } = await import("../lib/chat-session-api/sharing");

  const ownerId = "owner-1";
  const participantId = "user-1";
  const sessionId = "sess-1";

  const checks: Check[] = [
    {
      name: "missing session → 404 and does not mutate",
      run: async () => {
        const store = createFakeStore(null);
        const result = await optOutSharing(participantId, sessionId, store);
        assertEqual(result.status, 404, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Session not found" }, "body");
        }
        assertEqual(store.loadIds, [sessionId], "looked up session");
        assertEqual(store.disableIds, [], "disableSharing not called");
        assertEqual(store.discardIds, [], "discardSession not called");
      },
    },
    {
      name: "signed-in participant → disableSharing; session flagged unshared",
      run: async () => {
        const store = createFakeStore(
          sampleSession({ id: sessionId, participantId, shared: true })
        );
        const result = await optOutSharing(participantId, sessionId, store);
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body, { ok: true }, "body");
        }
        assertEqual(store.disableIds, [sessionId], "disableSharing id");
        assertEqual(store.discardIds, [], "does not discard signed-in session");
        assert(store.current !== null, "session still exists");
        assertEqual(store.current?.shared, false, "shared flipped off");
        assertEqual(store.current?.id, sessionId, "same session id");
      },
    },
    {
      name: "signed-in participant of already-unshared session → still disableSharing, { ok: true }",
      run: async () => {
        const store = createFakeStore(
          sampleSession({ id: sessionId, participantId, shared: false })
        );
        const result = await optOutSharing(participantId, sessionId, store);
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body, { ok: true }, "body");
        }
        assertEqual(store.disableIds, [sessionId], "idempotent off transition");
        assertEqual(store.discardIds, [], "does not discard");
        assertEqual(store.current?.shared, false, "remains unshared");
      },
    },
    {
      name: "signed-in participant uses disableSharing even if discard were preferred",
      run: async () => {
        const store = createFakeStore(
          sampleSession({ id: sessionId, participantId, shared: true })
        );
        const result = await optOutSharing(participantId, sessionId, store);
        assert(result.ok, "ok");
        assertEqual(store.disableIds, [sessionId], "disableSharing");
        assertEqual(
          store.discardIds,
          [],
          "never discard when caller is the signed-in participant"
        );
      },
    },
    {
      name: "anonymous caller on anonymous session → discardSession; session gone",
      run: async () => {
        const store = createFakeStore(
          sampleSession({
            id: sessionId,
            participantId: null,
            participantName: null,
            shared: true,
          })
        );
        const result = await optOutSharing(null, sessionId, store);
        assertEqual(result.status, 200, "status");
        assert(result.ok, "ok");
        if (result.ok) {
          assertEqual(result.body, { ok: true }, "body");
        }
        assertEqual(store.discardIds, [sessionId], "discardSession id");
        assertEqual(store.disableIds, [], "does not flag-flip anonymous session");
        assertEqual(store.current, null, "anonymous session no longer exists");
      },
    },
    {
      name: "signed-out caller on signed-in session → 403, no mutations",
      run: async () => {
        const store = createFakeStore(
          sampleSession({ id: sessionId, participantId, shared: true })
        );
        const result = await optOutSharing(null, sessionId, store);
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Forbidden" }, "body");
        }
        assertEqual(store.disableIds, [], "disableSharing not called");
        assertEqual(
          store.discardIds,
          [],
          "cannot discard someone else's signed-in session"
        );
        assertEqual(store.current?.shared, true, "sharing unchanged");
      },
    },
    {
      name: "signed-in non-participant on signed-in session → 403",
      run: async () => {
        const store = createFakeStore(
          sampleSession({ id: sessionId, participantId, shared: true })
        );
        const result = await optOutSharing("intruder", sessionId, store);
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Forbidden" }, "body");
        }
        assertEqual(store.disableIds, [], "disableSharing not called");
        assertEqual(store.discardIds, [], "discardSession not called");
        assertEqual(store.current?.shared, true, "sharing unchanged");
      },
    },
    {
      name: "bot owner who is not the participant → 403",
      run: async () => {
        const store = createFakeStore(
          sampleSession({ id: sessionId, ownerId, participantId, shared: true })
        );
        const result = await optOutSharing(ownerId, sessionId, store);
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Forbidden" }, "body");
        }
        assertEqual(store.disableIds, [], "owner cannot disable sharing");
        assertEqual(store.discardIds, [], "owner cannot discard");
      },
    },
    {
      name: "signed-in caller on anonymous session → 403 (not discard)",
      run: async () => {
        const store = createFakeStore(
          sampleSession({
            id: sessionId,
            participantId: null,
            participantName: null,
            shared: true,
          })
        );
        const result = await optOutSharing(participantId, sessionId, store);
        assertEqual(result.status, 403, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(result.body, { error: "Forbidden" }, "body");
        }
        assertEqual(store.disableIds, [], "disableSharing not called");
        assertEqual(
          store.discardIds,
          [],
          "signed-in caller cannot discard anonymous session"
        );
        assert(store.current !== null, "anonymous session still exists");
      },
    },
    {
      name: "handler signature has no re-enable payload",
      run: async () => {
        assertEqual(optOutSharing.length, 2, "arity is userId, sessionId (deps optional)");
      },
    },
    {
      name: "route is a thin POST auth wrapper around optOutSharing",
      run: async () => {
        const routePath = path.join(
          process.cwd(),
          "app/api/sessions/[sessionId]/sharing/route.ts"
        );
        const source = await fs.readFile(routePath, "utf-8");
        assert(
          source.includes('from "@/auth"') && source.includes("auth()"),
          "route calls auth()"
        );
        assert(
          source.includes("optOutSharing"),
          "route delegates to optOutSharing"
        );
        assert(
          source.includes("export async function POST"),
          "route exports POST"
        );
        assert(
          !source.includes("export async function GET") &&
            !source.includes("export async function PUT") &&
            !source.includes("export async function PATCH"),
          "off-only: no GET/PUT/PATCH re-enable surface"
        );
        assert(
          source.includes("sessionId"),
          "route reads sessionId from params"
        );
        assert(
          !source.includes("getSessionById") &&
            !source.includes("disableSharing") &&
            !source.includes("discardSession"),
          "route does not call store functions directly"
        );
        assert(
          !source.includes("req.json") &&
            !source.includes("request.json") &&
            !/_req\.json|_request\.json/.test(source),
          "no re-enable payload: route does not read a body"
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
