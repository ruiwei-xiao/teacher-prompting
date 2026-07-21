/**
 * Self-test: Invite join landing helpers + wiring (Task 6.8).
 * Run: npx tsx lib/workspace-ui/join.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  INVITE_NO_LONGER_VALID_MESSAGE,
  inviteJoinHref,
  inviteJoinSignInHref,
  joinApiHref,
  parseJoinResponse,
} from "./join";

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

async function main(): Promise<void> {
  // --- Routes (Req 2.2, 8.4, design: /workspace/invite/[token]) ---
  assertEqual(
    inviteJoinHref("tok_abc"),
    "/workspace/invite/tok_abc",
    "invite join page href is singular /workspace/invite/:token"
  );
  assert(
    !inviteJoinHref("tok_abc").includes("/workspaces/"),
    "invite join href must not use plural /workspaces/"
  );
  assertEqual(
    joinApiHref("tok_abc"),
    "/api/workspaces/join/tok_abc",
    "join API href matches task 2.3 route"
  );

  // --- Signed-out return-to join (Req 8.3, 8.4) ---
  const signInHref = inviteJoinSignInHref("tok_abc");
  assert(
    signInHref.startsWith("/?callbackUrl="),
    "signed-out return uses /?callbackUrl= pattern"
  );
  assert(
    decodeURIComponent(signInHref.replace("/?callbackUrl=", "")) ===
      "/workspace/invite/tok_abc",
    "callbackUrl returns to invite join landing"
  );

  // --- Successful join parse → workspace hub (Req 2.2, 9.2) ---
  const joinOk = parseJoinResponse(200, { workspaceId: "ws_joined" });
  assert(joinOk.ok === true, "200 join is ok");
  if (joinOk.ok) {
    assertEqual(joinOk.workspaceId, "ws_joined", "join returns workspaceId");
  }

  // --- Invalid / revoked / expired → no-longer-valid (Req 2.4) ---
  assert(
    INVITE_NO_LONGER_VALID_MESSAGE.toLowerCase().includes("no longer valid"),
    "user-facing copy says invite is no longer valid"
  );

  const gone = parseJoinResponse(410, {
    error: "Invite is no longer valid (revoked).",
  });
  assert(gone.ok === false, "410 join fails");
  if (!gone.ok) {
    assert(
      gone.error.toLowerCase().includes("no longer valid"),
      "410 surfaces no-longer-valid messaging"
    );
  }

  const expired = parseJoinResponse(410, {
    error: "Invite is no longer valid (expired).",
  });
  assert(expired.ok === false, "410 expired join fails");
  if (!expired.ok) {
    assert(
      expired.error.toLowerCase().includes("no longer valid"),
      "expired join surfaces no-longer-valid messaging"
    );
  }

  const notFound = parseJoinResponse(404, { error: "Invite not found" });
  assert(notFound.ok === false, "404 join fails");
  if (!notFound.ok) {
    assert(
      notFound.error.toLowerCase().includes("no longer valid") ||
        notFound.error.toLowerCase().includes("not found"),
      "404 join surfaces invalid-invite messaging"
    );
  }

  const unauthorized = parseJoinResponse(401, { error: "Unauthorized" });
  assert(unauthorized.ok === false, "401 join fails");

  const invalidBody = parseJoinResponse(200, { workspaceId: 123 });
  assert(invalidBody.ok === false, "invalid join payload fails");

  // --- UI wiring ---
  const helpersPath = path.join(process.cwd(), "lib/workspace-ui/join.ts");
  const landingPath = path.join(
    process.cwd(),
    "components/workspace/InviteJoinLanding.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/workspace/invite/[token]/page.tsx"
  );
  const proxyPath = path.join(process.cwd(), "proxy.ts");

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const landingSource = await fs.readFile(landingPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");
  const proxySource = await fs.readFile(proxyPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/join.ts exists");
  assert(
    landingSource.includes("InviteJoinLanding"),
    "InviteJoinLanding component exists"
  );
  assert(
    landingSource.includes("joinApiHref") ||
      landingSource.includes("/api/workspaces/join/"),
    "landing calls join API"
  );
  assert(
    landingSource.includes('method: "POST"') ||
      landingSource.includes("method: 'POST'") ||
      landingSource.includes('"POST"'),
    "landing POSTs join"
  );
  assert(
    landingSource.includes("parseJoinResponse") ||
      landingSource.includes("workspaceId"),
    "landing parses join response for workspaceId"
  );
  assert(
    landingSource.includes("workspaceHubHref") ||
      (landingSource.includes("/workspace/") &&
        landingSource.includes("router.push")),
    "successful join navigates to Workspace hub"
  );
  assert(
    landingSource.toLowerCase().includes("no longer valid") ||
      landingSource.includes("INVITE_NO_LONGER_VALID_MESSAGE"),
    "landing shows no-longer-valid messaging for invalid invites"
  );
  assert(
    pageSource.includes("InviteJoinLanding"),
    "invite/[token] page renders InviteJoinLanding"
  );
  assert(
    pageSource.includes("token") || pageSource.includes("params"),
    "invite page reads token from route params"
  );
  assert(
    proxySource.includes('"/workspace/:path*"'),
    "proxy matcher covers /workspace/:path* (signed-out → sign-in with callbackUrl)"
  );
  assert(
    proxySource.includes("callbackUrl"),
    "proxy sets callbackUrl so signed-out users return to join landing"
  );

  if (failures > 0) {
    console.error(`\njoin.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("join.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("join.selftest crashed:", err);
  process.exit(1);
});
