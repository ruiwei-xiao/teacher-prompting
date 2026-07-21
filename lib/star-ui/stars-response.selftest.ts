/**
 * Self-test: GET /api/stars response parser (Task 3.1).
 * Run: npx tsx lib/star-ui/stars-response.selftest.ts
 */
import { parseStarsListResponse } from "./stars-response";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function main(): void {
  const owned = {
    appId: "app_owned",
    title: "Owned bot",
    description: "Mine",
    owned: true,
    open: { kind: "editor" as const, href: "/app/app_owned/editor" },
    starredAt: "2026-07-21T12:00:00.000Z",
  };
  const peer = {
    appId: "app_peer",
    title: "Peer bot",
    owned: false,
    open: {
      kind: "peer" as const,
      href: "/workspace/ws_1/bots/app_peer",
      workspaceId: "ws_1",
    },
    starredAt: "2026-07-21T11:00:00.000Z",
  };

  const ok = parseStarsListResponse(200, { stars: [owned, peer] });
  assert(ok.ok === true, "200 with stars array is ok");
  if (ok.ok) {
    assertEqual(ok.stars.length, 2, "parses both stars");
    assertEqual(ok.stars[0]?.open.href, owned.open.href, "keeps editor open.href");
    assertEqual(ok.stars[1]?.open.href, peer.open.href, "keeps peer open.href");
    assertEqual(ok.stars[0]?.owned, true, "parses owned flag");
    assertEqual(ok.stars[1]?.open.kind, "peer", "parses peer open kind");
  }

  const empty = parseStarsListResponse(200, { stars: [] });
  assert(empty.ok === true, "200 empty stars is ok (true empty, not error)");
  if (empty.ok) {
    assertEqual(empty.stars.length, 0, "empty list length");
  }

  const unauthorized = parseStarsListResponse(401, { error: "Unauthorized" });
  assert(unauthorized.ok === false, "401 is not ok");
  if (!unauthorized.ok) {
    assertEqual(unauthorized.error, "Unauthorized", "surfaces 401 error message");
  }

  const serverError = parseStarsListResponse(500, { error: "Store failed" });
  assert(serverError.ok === false, "500 is not ok");
  if (!serverError.ok) {
    assertEqual(serverError.error, "Store failed", "surfaces 500 error message");
  }

  const invalid = parseStarsListResponse(200, { stars: "nope" });
  assert(invalid.ok === false, "200 with non-array stars fails");

  const missingHref = parseStarsListResponse(200, {
    stars: [
      {
        appId: "x",
        title: "Bad",
        owned: true,
        open: { kind: "editor" },
        starredAt: "2026-07-21T12:00:00.000Z",
      },
    ],
  });
  assert(missingHref.ok === false, "star without open.href is invalid");

  const missingOpen = parseStarsListResponse(200, {
    stars: [
      {
        appId: "x",
        title: "Bad",
        owned: true,
        starredAt: "2026-07-21T12:00:00.000Z",
      },
    ],
  });
  assert(missingOpen.ok === false, "star without open target is invalid");

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("OK: stars-response.selftest passed");
}

main();
