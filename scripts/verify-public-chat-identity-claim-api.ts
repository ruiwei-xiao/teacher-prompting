/**
 * Task-local verification for claiming visitor history over HTTP and on
 * sign-in (task 3.2). Exercises the injectable POST handler (auth userId +
 * cookie reader) without Next HTTP, and source-checks the jwt callback.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-claim-api.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  ClaimAnonymousVisitorDeps,
  ClaimAnonymousVisitorResult,
} from "../lib/public-chat-identity/claim";

type Check = { name: string; run: () => void | Promise<void> };

const VALID_VISITOR_ID = "550e8400-e29b-41d4-a716-446655440000";
const CLIENT_SUPPLIED_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-claim-1";
const HANDLER_PATH = "lib/public-chat-identity/claim-api.ts";
const ROUTE_PATH = "app/api/public-chat/identity/claim/route.ts";
const AUTH_PATH = "auth.ts";

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

function jsonHasVisitorIdField(json: string): boolean {
  return (
    /"visitorId"/i.test(json) ||
    /"anonymousVisitorId"/i.test(json) ||
    /"tp_anonymous_visitor_id"/i.test(json)
  );
}

function assertNoVisitorIdLeak(body: unknown, label: string): void {
  const json = JSON.stringify(body);
  assert(
    !json.includes(VALID_VISITOR_ID),
    `${label}: JSON must not echo the cookie visitor id`
  );
  assert(
    !json.includes(CLIENT_SUPPLIED_ID),
    `${label}: JSON must not echo a client-supplied id`
  );
  assert(
    !jsonHasVisitorIdField(json),
    `${label}: JSON must not include visitor id field names`
  );
}

function extractJwtCallback(authSource: string): string {
  const jwtStart = authSource.indexOf("async jwt({ token, user })");
  assert(jwtStart >= 0, "auth.ts exports a jwt callback");
  const jwtReturn = authSource.indexOf("return token;", jwtStart);
  assert(jwtReturn > jwtStart, "jwt callback returns token");
  return authSource.slice(jwtStart, jwtReturn + "return token;".length);
}

async function main() {
  const { claimVisitorIdentity } = await import(
    "../lib/public-chat-identity/claim-api"
  );
  const handlerSource = await readSource(HANDLER_PATH);
  const routeSource = await readSource(ROUTE_PATH);
  const authSource = await readSource(AUTH_PATH);

  const checks: Check[] = [
    {
      name: "signed-in claim with cookie returns { ok: true, status: claimed }",
      run: async () => {
        let claimedUserId: string | null = null;
        let readVisitorCalls = 0;
        const result = await claimVisitorIdentity(USER_ID, {
          readVisitorId: async () => {
            readVisitorCalls += 1;
            return VALID_VISITOR_ID;
          },
          claimForUser: async (userId, deps) => {
            claimedUserId = userId;
            const visitorId = (await deps?.readVisitorId?.()) ?? null;
            assert(visitorId === VALID_VISITOR_ID, "claim reads cookie visitor");
            return {
              status: "claimed",
              visitorId,
              attributedCount: 3,
            };
          },
        });
        assertEqual(result.status, 200, "status");
        assertEqual(result.ok, true, "ok");
        if (result.ok) {
          assertEqual(
            result.body,
            { ok: true, status: "claimed" },
            "claimed body"
          );
        }
        assertEqual(claimedUserId, USER_ID, "claim uses auth userId");
        assert(readVisitorCalls >= 1, "cookie reader was used");
        assertNoVisitorIdLeak(result.body, "claimed");
      },
    },
    {
      name: "signed-in claim without cookie returns { ok: true, status: no-visitor }",
      run: async () => {
        const result = await claimVisitorIdentity(USER_ID, {
          readVisitorId: async () => null,
          claimForUser: async (_userId, deps) => {
            const visitorId = (await deps?.readVisitorId?.()) ?? null;
            if (!visitorId) {
              return { status: "no-visitor" };
            }
            return {
              status: "claimed",
              visitorId,
              attributedCount: 0,
            };
          },
        });
        assertEqual(result.status, 200, "status");
        assertEqual(result.ok, true, "ok");
        if (result.ok) {
          assertEqual(
            result.body,
            { ok: true, status: "no-visitor" },
            "no-visitor body"
          );
        }
        assertNoVisitorIdLeak(result.body, "no-visitor");
      },
    },
    {
      name: "signed-in claim with default claimer and missing cookie is no-visitor",
      run: async () => {
        const result = await claimVisitorIdentity(USER_ID, {
          readVisitorId: async () => null,
        });
        assertEqual(result.status, 200, "status");
        assertEqual(result.ok, true, "ok");
        if (result.ok) {
          assertEqual(
            result.body,
            { ok: true, status: "no-visitor" },
            "default claimer no-visitor"
          );
        }
      },
    },
    {
      name: "unauthenticated claim is 401 and does not run claim or cookie read",
      run: async () => {
        let readVisitorCalls = 0;
        let claimCalls = 0;
        const result = await claimVisitorIdentity(null, {
          readVisitorId: async () => {
            readVisitorCalls += 1;
            return VALID_VISITOR_ID;
          },
          claimForUser: async () => {
            claimCalls += 1;
            return {
              status: "claimed",
              visitorId: VALID_VISITOR_ID,
              attributedCount: 1,
            };
          },
        });
        assertEqual(result.status, 401, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(typeof result.body.error, "string", "error message");
          assert(result.body.error.length > 0, "error message is not empty");
        }
        assertEqual(readVisitorCalls, 0, "cookie is not read when unsigned");
        assertEqual(claimCalls, 0, "claim is not run when unsigned");
        assertNoVisitorIdLeak(result.body, "unsigned");
      },
    },
    {
      name: "empty auth userId is rejected as unauthenticated",
      run: async () => {
        let claimCalls = 0;
        const result = await claimVisitorIdentity("", {
          claimForUser: async () => {
            claimCalls += 1;
            return { status: "no-visitor" };
          },
        });
        assertEqual(result.status, 401, "status");
        assertEqual(claimCalls, 0, "claim is not run for empty userId");
      },
    },
    {
      name: "claim throw returns 500 without leaking a visitor id",
      run: async () => {
        const originalError = console.error;
        console.error = () => {};
        let result: Awaited<ReturnType<typeof claimVisitorIdentity>>;
        try {
          result = await claimVisitorIdentity(USER_ID, {
            readVisitorId: async () => VALID_VISITOR_ID,
            claimForUser: async () => {
              throw new Error(`claim failed for ${VALID_VISITOR_ID}`);
            },
          });
        } finally {
          console.error = originalError;
        }
        assertEqual(result.status, 500, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(typeof result.body.error, "string", "error message");
          assert(result.body.error.length > 0, "error message is not empty");
        }
        assertNoVisitorIdLeak(result.body, "claim throw");
      },
    },
    {
      name: "handler never accepts a client-supplied visitor id",
      run: async () => {
        let usedVisitorId: string | null = null;
        const result = await (
          claimVisitorIdentity as (
            userId: string | null,
            deps?: {
              readVisitorId?: () => Promise<string | null>;
              claimForUser?: (
                userId: string,
                deps?: ClaimAnonymousVisitorDeps
              ) => Promise<ClaimAnonymousVisitorResult>;
            },
            clientId?: string
          ) => ReturnType<typeof claimVisitorIdentity>
        )(
          USER_ID,
          {
            readVisitorId: async () => VALID_VISITOR_ID,
            claimForUser: async (_userId, deps) => {
              usedVisitorId = (await deps?.readVisitorId?.()) ?? null;
              return {
                status: "claimed",
                visitorId: usedVisitorId ?? VALID_VISITOR_ID,
                attributedCount: 0,
              };
            },
          },
          CLIENT_SUPPLIED_ID
        );
        assertEqual(result.status, 200, "status");
        assertEqual(usedVisitorId, VALID_VISITOR_ID, "cookie id used");
        assert(
          usedVisitorId !== CLIENT_SUPPLIED_ID,
          "extra client-supplied argument is ignored"
        );
        assertEqual(
          claimVisitorIdentity.length,
          2,
          "arity is userId + deps"
        );
        assert(
          !handlerSource.includes("req.json") &&
            !handlerSource.includes("request.json"),
          "handler does not read a request body"
        );
        assertNoVisitorIdLeak(result.body, "no client id");
      },
    },
    {
      name: "handler requires auth userId and forwards only the cookie reader",
      run: () => {
        assert(
          handlerSource.includes("claimAnonymousVisitorForUser"),
          "handler defaults to claimAnonymousVisitorForUser"
        );
        assert(
          handlerSource.includes("readVisitorId"),
          "handler accepts a cookie reader"
        );
        assert(
          /userId:\s*string\s*\|\s*null/.test(handlerSource) ||
            handlerSource.includes("userId: string | null"),
          "handler takes auth userId or null"
        );
        assert(
          handlerSource.includes("status: 401") ||
            handlerSource.includes("{ status: 401 }"),
          "handler returns 401 when unsigned"
        );
        assert(!/\bany\b/.test(handlerSource), "handler does not use any");
      },
    },
    {
      name: "route is an authenticated POST wrapper around the claim handler",
      run: () => {
        assert(
          routeSource.includes("export async function POST"),
          "route exports POST"
        );
        assert(
          !routeSource.includes("export async function GET") &&
            !routeSource.includes("export async function PUT") &&
            !routeSource.includes("export async function PATCH"),
          "claim stays on POST"
        );
        assert(
          routeSource.includes("await auth()") ||
            routeSource.includes("auth()"),
          "route requires auth()"
        );
        assert(
          routeSource.includes('from "@/auth"'),
          "route imports auth from @/auth"
        );
        assert(
          routeSource.includes("claimVisitorIdentity"),
          "route delegates to claimVisitorIdentity"
        );
        assert(
          routeSource.includes("session?.user?.id") ||
            routeSource.includes("session.user.id") ||
            routeSource.includes("session?.user?.id ?? null"),
          "route passes the authenticated user id"
        );
        assert(
          routeSource.includes("{ status: 500 }") ||
            routeSource.includes("status: 500"),
          "route returns 500 on failure"
        );
        assert(
          !routeSource.includes("req.json") &&
            !routeSource.includes("request.json"),
          "route does not read a client body"
        );
        assert(
          !/"visitorId"/.test(routeSource) &&
            !/"anonymousVisitorId"/.test(routeSource),
          "route JSON does not name a visitor id field"
        );
        assert(!/\bany\b/.test(routeSource), "route does not use any");
      },
    },
    {
      name: "jwt on-sign-in claims in try/catch and still returns token",
      run: () => {
        assert(
          authSource.includes(
            'from "@/lib/public-chat-identity/claim"'
          ) ||
            authSource.includes(
              'from "@/lib/public-chat-identity/claim.ts"'
            ),
          "auth.ts imports claimAnonymousVisitorForUser"
        );
        assert(
          authSource.includes("claimAnonymousVisitorForUser"),
          "auth.ts references claimAnonymousVisitorForUser"
        );

        const jwtBody = extractJwtCallback(authSource);
        const claimCall = jwtBody.indexOf("claimAnonymousVisitorForUser");
        assert(claimCall >= 0, "jwt callback calls claimAnonymousVisitorForUser");

        const guard = jwtBody.lastIndexOf("if (user && token.userId)", claimCall);
        assert(
          guard >= 0 && guard < claimCall,
          "claim runs only when user and token.userId are present"
        );
        assert(
          jwtBody.includes("claimAnonymousVisitorForUser(String(token.userId))"),
          "jwt claims for token.userId"
        );

        const tryBefore = jwtBody.lastIndexOf("try {", claimCall);
        assert(tryBefore >= 0 && tryBefore < claimCall, "claim is inside try");
        const catchAfter = jwtBody.indexOf("catch (error)", claimCall);
        assert(catchAfter > claimCall, "claim has catch after the call");

        const catchBlock = jwtBody.slice(catchAfter);
        assert(
          catchBlock.includes("console.error"),
          "claim failure is logged"
        );
        assert(
          /anonymous visitor|claim/i.test(catchBlock),
          "log names the claim failure"
        );
        assert(
          !/\bthrow /.test(catchBlock),
          "catch does not rethrow, so sign-in still succeeds"
        );
        assert(
          jwtBody.trim().endsWith("return token;"),
          "jwt still returns token after claim"
        );
      },
    },
    {
      name: "jwt keeps existing on-sign-in side effects",
      run: () => {
        const jwtBody = extractJwtCallback(authSource);
        assert(
          jwtBody.includes("acceptPendingEmailInvitesOnSignIn"),
          "invite accept on sign-in remains"
        );
        assert(
          jwtBody.includes("rememberDisplayProfile"),
          "display profile remember remains"
        );
        const inviteTry = jwtBody.indexOf("acceptPendingEmailInvitesOnSignIn");
        const inviteCatch = jwtBody.indexOf("catch (error)", inviteTry);
        assert(
          jwtBody.lastIndexOf("try {", inviteTry) < inviteTry &&
            inviteCatch > inviteTry,
          "invite accept stays in try/catch"
        );
        const profileCall = jwtBody.indexOf("rememberDisplayProfile");
        const profileCatch = jwtBody.indexOf("catch (error)", profileCall);
        assert(
          jwtBody.lastIndexOf("try {", profileCall) < profileCall &&
            profileCatch > profileCall,
          "display profile remember stays in try/catch"
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
