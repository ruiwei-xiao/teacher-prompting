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

async function main(): Promise<void> {
  const source = await fs.readFile(
    path.join(process.cwd(), "proxy.ts"),
    "utf8"
  );

  const matcherMatch = source.match(/matcher:\s*\[([\s\S]*?)\]/);
  assert(Boolean(matcherMatch), "proxy.ts exports a matcher array");

  const matcherBody = matcherMatch?.[1] ?? "";
  const required = [
    "/workspace/:path*",
    "/api/workspaces",
    "/api/workspaces/:path*",
    "/starred",
    "/api/stars",
    "/api/stars/:path*",
  ];

  for (const entry of required) {
    assert(
      matcherBody.includes(`"${entry}"`),
      `matcher includes "${entry}"`
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
      matcherBody.includes(`"${entry}"`),
      `matcher retains "${entry}"`
    );
  }

  assert(
    source.includes("callbackUrl"),
    "unauthenticated redirect sets callbackUrl for return after sign-in"
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
