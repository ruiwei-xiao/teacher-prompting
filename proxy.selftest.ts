/**
 * Self-test: Auth-edge matcher coverage for Workspace and Starred routes.
 * Verifies proxy.ts matcher protects Workspace/Starred pages and APIs.
 *
 * Run: npx tsx proxy.selftest.ts
 */
import fs from "fs/promises";
import path from "path";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

/** Extract quoted string entries from a matcher array body. */
function parseMatcherEntries(matcherBody: string): string[] {
  const entries: string[] = [];
  const re = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(matcherBody)) !== null) {
    entries.push(match[1]!);
  }
  return entries;
}

async function main(): Promise<void> {
  const source = await fs.readFile(
    path.join(process.cwd(), "proxy.ts"),
    "utf8"
  );

  const matcherMatch = source.match(/matcher:\s*\[([\s\S]*?)\]/);
  assert(Boolean(matcherMatch), "proxy.ts exports a matcher array");

  const matcherBody = matcherMatch?.[1] ?? "";
  const entries = parseMatcherEntries(matcherBody);
  const entrySet = new Set(entries);

  const starredRequired = ["/starred", "/api/stars", "/api/stars/:path*"];
  for (const entry of starredRequired) {
    assert(
      entrySet.has(entry),
      `matcher includes exact entry "${entry}" for Starred auth gating`
    );
  }

  // Nested star API paths must be gated separately from the collection path.
  assert(
    entrySet.has("/api/stars") && entrySet.has("/api/stars/:path*"),
    "matcher gates both /api/stars and /api/stars/:path* (not only one)"
  );

  const workspaceRequired = [
    "/workspace/:path*",
    "/api/workspaces",
    "/api/workspaces/:path*",
  ];
  for (const entry of workspaceRequired) {
    assert(
      entrySet.has(entry),
      `matcher includes exact entry "${entry}"`
    );
  }

  // Existing apps/create coverage must remain.
  for (const entry of [
    "/create",
    "/app/:path*",
    "/api/apps",
    "/api/apps/:path*",
  ]) {
    assert(
      entrySet.has(entry),
      `matcher retains exact entry "${entry}"`
    );
  }

  // Public home must stay ungated so sign-in redirect target is reachable.
  assert(
    !entrySet.has("/"),
    "matcher does not gate public home / (sign-in landing)"
  );

  assert(
    source.includes("auth("),
    "proxy wraps handler with auth() for session gating"
  );
  assert(
    source.includes("callbackUrl"),
    "unauthenticated redirect sets callbackUrl for return after sign-in"
  );
  assert(
    source.includes("req.nextUrl.pathname") &&
      source.includes("req.nextUrl.search"),
    "callbackUrl preserves pathname and search for return after sign-in"
  );

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: proxy matcher covers Workspace and Starred pages/APIs with callbackUrl"
  );
}

void main();
