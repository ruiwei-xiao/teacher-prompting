/**
 * Task-local verification for claiming anonymous visitor history (task 2.2).
 * Forces JSON-file stores and injects the cookie reader + display name so
 * npx tsx runs without Next.js or Postgres.
 *
 * Covers: cookie visitor → mapping + session promotion; missing visitor →
 * no-visitor; claim is idempotent; a later user does not steal attributed rows.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-claim.ts
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  ANONYMOUS_VISITOR_COOKIE,
  readAnonymousVisitorIdFromStore,
  type AnonymousVisitorCookieStore,
  type VisitorCookieOptions,
} from "../lib/public-chat-identity/cookie";

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

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
}

type MemoryCookieStore = AnonymousVisitorCookieStore & {
  setCount: number;
};

function createMemoryCookieStore(visitorId?: string): MemoryCookieStore {
  const values = new Map<string, string>();
  if (visitorId !== undefined) {
    values.set(ANONYMOUS_VISITOR_COOKIE, visitorId);
  }
  const store: MemoryCookieStore = {
    setCount: 0,
    get(name: string) {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set(_name: string, _value: string, _options: VisitorCookieOptions) {
      store.setCount += 1;
    },
  };
  return store;
}

async function main() {
  const sessionsFile = path.join(
    os.tmpdir(),
    `chat-sessions-claim-${process.pid}-${Date.now()}.json`
  );
  const linksFile = path.join(
    os.tmpdir(),
    `anonymous-visitor-links-claim-${process.pid}-${Date.now()}.json`
  );
  process.env.CHAT_SESSIONS_DATA_FILE = sessionsFile;
  process.env.ANONYMOUS_VISITOR_LINKS_DATA_FILE = linksFile;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const { upsertSessionTurn, getSessionById, listSessionsForUser } =
    await import("../lib/chat-session-store/store");
  const { listAnonymousVisitorLinksForVisitor } = await import(
    "../lib/public-chat-identity/store"
  );
  const claim = await import("../lib/public-chat-identity/claim");
  const typesSource = await readSource("lib/public-chat-identity/types.ts");
  const claimSource = await readSource("lib/public-chat-identity/claim.ts");

  const visitorA = "11111111-2222-4333-8444-555555555555";
  const visitorB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const visitorNoCookie = "00000000-1111-4222-8333-444444444444";
  const visitorNameFail = "cccccccc-dddd-4eee-8fff-000000000000";
  const userOne = "user-one";
  const userTwo = "user-two";
  const displayOne = "Ada Lovelace";
  const displayTwo = "Grace Hopper";

  const firstHistory = [
    {
      role: "user" as const,
      content: "Hello",
      at: "2026-09-21T12:00:00.000Z",
    },
    {
      role: "assistant" as const,
      content: "Hi there",
      at: "2026-09-21T12:00:01.000Z",
    },
  ];

  async function seedPublicSession(input: {
    id: string;
    visitorId: string;
    participantId?: string | null;
    participantName?: string | null;
  }) {
    await upsertSessionTurn({
      id: input.id,
      appId: "app-claim-1",
      appName: "Claim Tutor",
      ownerId: "owner-1",
      participantId: input.participantId ?? null,
      participantName: input.participantName ?? null,
      anonymousVisitorId: input.visitorId,
      surface: "public",
      messages: firstHistory,
    });
  }

  function claimDeps(input: {
    cookie: MemoryCookieStore;
    displayName?: string | null;
    resolveDisplayName?: (userId: string) => Promise<string | null>;
  }) {
    return {
      readVisitorId: async () => readAnonymousVisitorIdFromStore(input.cookie),
      resolveDisplayName:
        input.resolveDisplayName ??
        (async () => input.displayName ?? null),
    };
  }

  const checks: Check[] = [
    {
      name: "missing visitor id returns no-visitor without failing the user",
      run: async () => {
        const sessionId = "claim-no-visitor-session";
        await seedPublicSession({ id: sessionId, visitorId: visitorNoCookie });
        const cookie = createMemoryCookieStore();

        const result = await claim.claimAnonymousVisitorForUser(
          userOne,
          claimDeps({ cookie, displayName: displayOne })
        );

        assertEqual(result.status, "no-visitor", "status");
        assertEqual(cookie.setCount, 0, "claim does not mint a visitor cookie");

        const session = await getSessionById(sessionId);
        assert(session, "anonymous session still exists");
        assertEqual(session.participantId, null, "participantId stays null");
        assertEqual(session.participantName, null, "participantName stays null");

        const links = await listAnonymousVisitorLinksForVisitor(visitorNoCookie);
        assertEqual(links.length, 0, "no mapping is recorded without a cookie");
      },
    },
    {
      name: "invalid remembered visitor id is treated as no-visitor",
      run: async () => {
        const cookie = createMemoryCookieStore("not-a-uuid");
        const result = await claim.claimAnonymousVisitorForUser(
          userOne,
          claimDeps({ cookie, displayName: displayOne })
        );
        assertEqual(result.status, "no-visitor", "status");
        assertEqual(cookie.setCount, 0, "invalid cookie is not rewritten");
      },
    },
    {
      name: "with a visitor id, a mapping exists and anonymous sessions are attributed",
      run: async () => {
        const sessionId = "claim-promote-null";
        const otherVisitorSessionId = "claim-other-visitor";
        await seedPublicSession({ id: sessionId, visitorId: visitorA });
        await seedPublicSession({
          id: otherVisitorSessionId,
          visitorId: visitorB,
        });
        const cookie = createMemoryCookieStore(visitorA);

        const result = await claim.claimAnonymousVisitorForUser(
          userOne,
          claimDeps({ cookie, displayName: displayOne })
        );

        assertEqual(result.status, "claimed", "status");
        if (result.status === "claimed") {
          assertEqual(result.visitorId, visitorA, "visitorId");
          assertEqual(result.attributedCount, 1, "attributedCount");
        }

        const links = await listAnonymousVisitorLinksForVisitor(visitorA);
        assertEqual(links.length, 1, "one mapping row");
        assertEqual(links[0]?.anonymousVisitorId, visitorA, "mapping visitor id");
        assertEqual(links[0]?.userId, userOne, "mapping user id");

        const session = await getSessionById(sessionId);
        assert(session, "promoted session exists");
        assertEqual(session.participantId, userOne, "participantId");
        assertEqual(session.participantName, displayOne, "display name");
        assertEqual(
          session.anonymousVisitorId,
          visitorA,
          "visitor id is retained"
        );
        assertEqual(session.messages, firstHistory, "transcript stays put");

        const other = await getSessionById(otherVisitorSessionId);
        assert(other, "other visitor session exists");
        assertEqual(
          other.participantId,
          null,
          "a different browser's sessions stay unattributed"
        );

        const mine = await listSessionsForUser(userOne, {
          limit: 20,
          offset: 0,
        });
        assert(
          mine.items.some((item) => item.id === sessionId),
          "promoted session appears in My sessions"
        );
      },
    },
    {
      name: "a second claim by the same user is idempotent",
      run: async () => {
        const cookie = createMemoryCookieStore(visitorA);
        const before = await listAnonymousVisitorLinksForVisitor(visitorA);
        assertEqual(before.length, 1, "mapping already exists");
        const originalLinkedAt = before[0]?.linkedAt;
        assert(originalLinkedAt, "linkedAt is present");

        const result = await claim.claimAnonymousVisitorForUser(
          userOne,
          claimDeps({ cookie, displayName: displayOne })
        );

        assertEqual(result.status, "claimed", "status");
        if (result.status === "claimed") {
          assertEqual(result.visitorId, visitorA, "visitorId");
          assertEqual(result.attributedCount, 0, "already attributed");
        }

        const after = await listAnonymousVisitorLinksForVisitor(visitorA);
        assertEqual(after.length, 1, "repeat claim does not duplicate the pair");
        assertEqual(after[0]?.linkedAt, originalLinkedAt, "linkedAt unchanged");

        const session = await getSessionById("claim-promote-null");
        assert(session, "session still exists");
        assertEqual(session.participantId, userOne, "still the same user");
        assertEqual(session.participantName, displayOne, "display name unchanged");
      },
    },
    {
      name: "a second claim does not steal another user's sessions",
      run: async () => {
        const stillOpenId = "claim-still-open";
        await seedPublicSession({ id: stillOpenId, visitorId: visitorA });
        const cookie = createMemoryCookieStore(visitorA);

        const result = await claim.claimAnonymousVisitorForUser(
          userTwo,
          claimDeps({ cookie, displayName: displayTwo })
        );

        assertEqual(result.status, "claimed", "status");
        if (result.status === "claimed") {
          assertEqual(result.visitorId, visitorA, "visitorId");
          assertEqual(result.attributedCount, 1, "only the still-open row");
        }

        const claimed = await getSessionById("claim-promote-null");
        assert(claimed, "earlier session still exists");
        assertEqual(
          claimed.participantId,
          userOne,
          "already-claimed participantId stays put"
        );
        assertEqual(
          claimed.participantName,
          displayOne,
          "already-claimed display name stays put"
        );

        const open = await getSessionById(stillOpenId);
        assert(open, "still-open session exists");
        assertEqual(open.participantId, userTwo, "open row becomes the later user");
        assertEqual(open.participantName, displayTwo, "open row display name");

        const links = await listAnonymousVisitorLinksForVisitor(visitorA);
        const userIds = [...new Set(links.map((link) => link.userId))].sort();
        assertEqual(userIds, [userOne, userTwo], "both users are linked");

        const userOneSessions = await listSessionsForUser(userOne, {
          limit: 20,
          offset: 0,
        });
        assert(
          userOneSessions.items.some((item) => item.id === "claim-promote-null"),
          "first user still sees their attributed session"
        );
        assert(
          !userOneSessions.items.some((item) => item.id === stillOpenId),
          "first user does not receive the later claim"
        );
      },
    },
    {
      name: "claim remembers the visitor-user link before attributing sessions",
      run: async () => {
        const events: string[] = [];
        const cookie = createMemoryCookieStore(visitorA);
        const result = await claim.claimAnonymousVisitorForUser(userOne, {
          ...claimDeps({ cookie, displayName: displayOne }),
          rememberLink: async () => {
            events.push("remember");
          },
          attributeSessions: async () => {
            events.push("attribute");
            return { attributedCount: 0 };
          },
        });
        assertEqual(result.status, "claimed", "status");
        assertEqual(events, ["remember", "attribute"], "remember then attribute");
      },
    },
    {
      name: "display name lookup failure still claims without failing the user",
      run: async () => {
        const sessionId = "claim-name-lookup-fail";
        await seedPublicSession({ id: sessionId, visitorId: visitorNameFail });
        const cookie = createMemoryCookieStore(visitorNameFail);
        const result = await claim.claimAnonymousVisitorForUser(userOne, {
          readVisitorId: async () => readAnonymousVisitorIdFromStore(cookie),
          resolveDisplayName: async () => {
            throw new Error("display profile unavailable");
          },
        });
        assertEqual(result.status, "claimed", "status");
        if (result.status === "claimed") {
          assertEqual(result.attributedCount, 1, "attributedCount");
        }
        const session = await getSessionById(sessionId);
        assert(session, "session exists after claim");
        assertEqual(session.participantId, userOne, "participantId is set");
      },
    },
    {
      name: "claim.ts exports the designed service and uses store helpers",
      run: async () => {
        assert(
          typeof claim.claimAnonymousVisitorForUser === "function",
          "claimAnonymousVisitorForUser is exported"
        );
        assertEqual(
          claim.claimAnonymousVisitorForUser.length,
          1,
          "claimAnonymousVisitorForUser takes userId (deps optional)"
        );
        assert(
          typesSource.includes("ClaimAnonymousVisitorResult"),
          "ClaimAnonymousVisitorResult lives in types.ts"
        );
        assert(
          typesSource.includes('status: "claimed"') ||
            typesSource.includes("status: \"claimed\""),
          "claimed result variant is declared"
        );
        assert(
          typesSource.includes("no-visitor"),
          "no-visitor result variant is declared"
        );
        assert(
          typesSource.includes("attributedCount"),
          "attributedCount is declared"
        );
        assert(
          claimSource.includes("rememberAnonymousVisitorLink"),
          "claim records the visitor-user link"
        );
        assert(
          claimSource.includes("attributeSessionsForVisitor"),
          "claim promotes still-unattributed sessions"
        );
        assert(
          claimSource.includes("getUserById") &&
            claimSource.includes("getDisplayProfiles"),
          "display name uses the same user store / display profiles as recording"
        );
        assert(
          claimSource.includes("readAnonymousVisitorId"),
          "claim reads the remembered visitor cookie"
        );
        assert(
          !claimSource.includes("app/api") &&
            !claimSource.includes("NextResponse"),
          "claim module does not add HTTP routes"
        );
        assert(!/\bany\b/.test(claimSource), "claim.ts does not use any");
        assert(!/\bany\b/.test(typesSource), "types.ts does not use any");
      },
    },
  ];

  let failed = 0;
  try {
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
  } finally {
    await fs.rm(sessionsFile, { force: true });
    await fs.rm(linksFile, { force: true });
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${checks.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks.length} checks passed.`);
}

void main();
