/**
 * Task-local verification for anonymous visitor-to-account links (task 1.4).
 * Forces the JSON-file backend and isolates storage to a temp file.
 *
 * Covers: remember a visitor-user pair; repeats are no-ops; the same visitor
 * id may later link to a different user; write then read returns the pair.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-links.ts
 */
import fs from "fs/promises";
import os from "os";
import path from "path";

type Check = { name: string; run: () => Promise<void> };

type AnonymousVisitorLink = {
  anonymousVisitorId: string;
  userId: string;
  linkedAt: string;
};

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

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(value).toISOString() === value;
}

function sortLinks(links: AnonymousVisitorLink[]): AnonymousVisitorLink[] {
  return [...links].sort((a, b) => {
    const userCmp = a.userId.localeCompare(b.userId);
    if (userCmp !== 0) {
      return userCmp;
    }
    return a.anonymousVisitorId.localeCompare(b.anonymousVisitorId);
  });
}

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
}

async function readLinksFile(dataFile: string): Promise<AnonymousVisitorLink[]> {
  const raw = await fs.readFile(dataFile, "utf-8");
  const parsed = JSON.parse(raw) as { links?: unknown };
  assert(Array.isArray(parsed.links), "JSON file must have a links array");
  return parsed.links as AnonymousVisitorLink[];
}

async function main() {
  const dataFile = path.join(
    os.tmpdir(),
    `anonymous-visitor-links-verify-${process.pid}-${Date.now()}.json`
  );
  process.env.ANONYMOUS_VISITOR_LINKS_DATA_FILE = dataFile;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const store = await import("../lib/public-chat-identity/store");
  const storeSource = await readSource("lib/public-chat-identity/store.ts");
  const typesSource = await readSource("lib/public-chat-identity/types.ts");

  const visitorA = "11111111-2222-4333-8444-555555555555";
  const visitorB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const userOne = "user-one";
  const userTwo = "user-two";

  const checks: Check[] = [
    {
      name: "write then read returns the visitor-user pair",
      run: async () => {
        await store.rememberAnonymousVisitorLink(visitorA, userOne);
        const links = await store.listAnonymousVisitorLinksForVisitor(visitorA);
        assertEqual(links.length, 1, "link count after first write");
        assertEqual(links[0]?.anonymousVisitorId, visitorA, "anonymousVisitorId");
        assertEqual(links[0]?.userId, userOne, "userId");
        assert(typeof links[0]?.linkedAt === "string", "linkedAt is a string");
        assert(
          isIsoTimestamp(links[0].linkedAt),
          "linkedAt is an ISO-8601 timestamp"
        );
      },
    },
    {
      name: "repeating the same pair is a no-op and does not duplicate",
      run: async () => {
        const before = await store.listAnonymousVisitorLinksForVisitor(visitorA);
        assertEqual(before.length, 1, "pair already exists from prior write");
        const originalLinkedAt = before[0]?.linkedAt;
        assert(originalLinkedAt, "original linkedAt is present");

        await store.rememberAnonymousVisitorLink(visitorA, userOne);
        const after = await store.listAnonymousVisitorLinksForVisitor(visitorA);
        assertEqual(after.length, 1, "second write does not add a row");
        assertEqual(after[0]?.anonymousVisitorId, visitorA, "anonymousVisitorId");
        assertEqual(after[0]?.userId, userOne, "userId");
        assertEqual(after[0]?.linkedAt, originalLinkedAt, "linkedAt unchanged");

        const fileLinks = await readLinksFile(dataFile);
        const matching = fileLinks.filter(
          (link) =>
            link.anonymousVisitorId === visitorA && link.userId === userOne
        );
        assertEqual(matching.length, 1, "JSON file has one row for the pair");
      },
    },
    {
      name: "the same visitor id may later also link to a different user",
      run: async () => {
        await store.rememberAnonymousVisitorLink(visitorA, userTwo);
        const links = sortLinks(
          await store.listAnonymousVisitorLinksForVisitor(visitorA)
        );
        assertEqual(links.length, 2, "visitor now linked to two users");
        assertEqual(
          links.map((link) => link.userId),
          [userOne, userTwo],
          "both user ids are present"
        );
        assert(
          links.every((link) => link.anonymousVisitorId === visitorA),
          "both rows keep the same visitor id"
        );
        assert(
          links.every((link) => isIsoTimestamp(link.linkedAt)),
          "both linkedAt values are ISO-8601"
        );

        const fileLinks = await readLinksFile(dataFile);
        const forVisitor = fileLinks.filter(
          (link) => link.anonymousVisitorId === visitorA
        );
        assertEqual(forVisitor.length, 2, "JSON file has both visitor A rows");
      },
    },
    {
      name: "a different visitor linking to an existing user is a separate pair",
      run: async () => {
        await store.rememberAnonymousVisitorLink(visitorB, userOne);
        const visitorALinks = await store.listAnonymousVisitorLinksForVisitor(
          visitorA
        );
        const visitorBLinks = await store.listAnonymousVisitorLinksForVisitor(
          visitorB
        );
        assertEqual(visitorALinks.length, 2, "visitor A links unchanged");
        assertEqual(visitorBLinks.length, 1, "visitor B has one link");
        assertEqual(visitorBLinks[0]?.userId, userOne, "visitor B userId");
        assertEqual(
          visitorBLinks[0]?.anonymousVisitorId,
          visitorB,
          "visitor B id"
        );

        const fileLinks = await readLinksFile(dataFile);
        assertEqual(fileLinks.length, 3, "JSON file has three distinct pairs");
      },
    },
    {
      name: "store.ts is a dual Postgres/JSON façade for anonymous_visitor_links",
      run: async () => {
        assert(
          storeSource.includes("function shouldUsePostgres"),
          "shouldUsePostgres exists"
        );
        assert(
          storeSource.includes("POSTGRES_URL") &&
            storeSource.includes("POSTGRES_URL_NON_POOLING") &&
            storeSource.includes("POSTGRES_PRISMA_URL"),
          "Postgres env chooser matches other stores"
        );
        assert(
          storeSource.includes("CREATE TABLE IF NOT EXISTS anonymous_visitor_links"),
          "CREATE TABLE IF NOT EXISTS anonymous_visitor_links"
        );
        assert(
          /PRIMARY KEY\s*\(\s*anonymous_visitor_id\s*,\s*user_id\s*\)/.test(
            storeSource
          ),
          "PRIMARY KEY (anonymous_visitor_id, user_id)"
        );
        assert(
          storeSource.includes("linked_at"),
          "linked_at column is present"
        );
        assert(
          /ON CONFLICT\s*\(\s*anonymous_visitor_id\s*,\s*user_id\s*\)\s*DO NOTHING/.test(
            storeSource
          ),
          "repeat inserts are ON CONFLICT DO NOTHING"
        );
        assert(
          storeSource.includes("anonymous-visitor-links.json"),
          "JSON fallback is .data/anonymous-visitor-links.json"
        );
        assert(
          storeSource.includes("ANONYMOUS_VISITOR_LINKS_DATA_FILE"),
          "JSON path env override exists"
        );
        assert(
          typeof store.rememberAnonymousVisitorLink === "function",
          "rememberAnonymousVisitorLink is exported"
        );
        assert(
          typeof store.listAnonymousVisitorLinksForVisitor === "function",
          "listAnonymousVisitorLinksForVisitor is exported"
        );
        assertEqual(
          store.rememberAnonymousVisitorLink.length,
          2,
          "rememberAnonymousVisitorLink takes visitor id and user id"
        );
        assert(
          !/from\s+["'][^"']*chat-session-store/.test(storeSource),
          "store does not import chat-session-store"
        );
        assert(!/\bany\b/.test(storeSource), "store.ts does not use any");
      },
    },
    {
      name: "AnonymousVisitorLink type lives in types.ts",
      run: async () => {
        assert(
          typesSource.includes("AnonymousVisitorLink"),
          "AnonymousVisitorLink is declared"
        );
        assert(
          typesSource.includes("anonymousVisitorId"),
          "anonymousVisitorId field is declared"
        );
        assert(typesSource.includes("userId"), "userId field is declared");
        assert(typesSource.includes("linkedAt"), "linkedAt field is declared");
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
    await fs.rm(dataFile, { force: true });
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${checks.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks.length} checks passed.`);
}

void main();
