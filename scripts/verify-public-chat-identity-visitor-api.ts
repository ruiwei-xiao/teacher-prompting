/**
 * Task-local verification for the public visitor cookie HTTP API (task 3.1).
 * Exercises the injectable handler without Next HTTP and source-checks the
 * thin route wrapper.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-visitor-api.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  AnonymousVisitorCookieStore,
  VisitorCookieOptions,
} from "../lib/public-chat-identity/cookie";

type Check = { name: string; run: () => void | Promise<void> };

const COOKIE_NAME = "tp_anonymous_visitor_id";
const VALID_VISITOR_ID = "550e8400-e29b-41d4-a716-446655440000";
const CLIENT_SUPPLIED_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_PATH = "app/api/public-chat/visitor/route.ts";
const HANDLER_PATH = "lib/public-chat-identity/visitor-api.ts";

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

function jsonHasVisitorIdField(json: string): boolean {
  return (
    /"visitorId"/i.test(json) ||
    /"anonymousVisitorId"/i.test(json) ||
    /"tp_anonymous_visitor_id"/i.test(json)
  );
}

function assertSuccessDoesNotEchoId(
  body: unknown,
  visitorId: string,
  label: string
): void {
  assertEqual(body, { ok: true }, `${label} body`);
  const json = JSON.stringify(body);
  assert(!json.includes(visitorId), `${label}: JSON must not echo visitor id`);
  assert(
    !jsonHasVisitorIdField(json),
    `${label}: JSON must not include visitor id field names`
  );
}

async function main() {
  const { issueOrReuseVisitorCookie } = await import(
    "../lib/public-chat-identity/visitor-api"
  );
  const cookie = await import("../lib/public-chat-identity/cookie");
  const handlerSource = await readSource(HANDLER_PATH);
  const routeSource = await readSource(ROUTE_PATH);

  const checks: Check[] = [
    {
      name: "missing cookie issues a visitor id and returns { ok: true } without echoing it",
      run: () => {
        const store = createMemoryCookieStore();
        const result = issueOrReuseVisitorCookie(store, false);
        assertEqual(result.status, 200, "status");
        assertEqual(result.ok, true, "ok");
        const issued = store.values.get(COOKIE_NAME);
        assert(typeof issued === "string", "cookie was written");
        assert(
          cookie.isAnonymousVisitorId(issued),
          "issued cookie is a UUID v4"
        );
        assertEqual(store.lastSet?.name, COOKIE_NAME, "Set-Cookie name");
        assertEqual(store.setCount, 1, "cookie written once");
        assertSuccessDoesNotEchoId(result.body, issued, "issue");
      },
    },
    {
      name: "existing valid cookie is reused and JSON still omits the id",
      run: () => {
        const store = createMemoryCookieStore({
          [COOKIE_NAME]: VALID_VISITOR_ID,
        });
        const result = issueOrReuseVisitorCookie(store, true);
        assertEqual(result.status, 200, "status");
        assertEqual(result.ok, true, "ok");
        assertEqual(
          store.values.get(COOKIE_NAME),
          VALID_VISITOR_ID,
          "remembered id kept"
        );
        assertEqual(store.setCount, 0, "reuse does not overwrite the cookie");
        assertSuccessDoesNotEchoId(result.body, VALID_VISITOR_ID, "reuse");
      },
    },
    {
      name: "calling the endpoint twice keeps one visitor id",
      run: () => {
        const store = createMemoryCookieStore();
        const first = issueOrReuseVisitorCookie(store, false);
        const firstId = store.values.get(COOKIE_NAME);
        assert(typeof firstId === "string", "first call wrote a cookie");
        const second = issueOrReuseVisitorCookie(store, false);
        const secondId = store.values.get(COOKIE_NAME);
        assertEqual(first.status, 200, "first status");
        assertEqual(second.status, 200, "second status");
        assertEqual(firstId, secondId, "same visitor id across calls");
        assertEqual(store.setCount, 1, "cookie written only on first call");
        assertSuccessDoesNotEchoId(first.body, firstId, "first call");
        assertSuccessDoesNotEchoId(second.body, firstId, "second call");
      },
    },
    {
      name: "forgotten cookie is treated as a new visitor",
      run: () => {
        const previous = createMemoryCookieStore({
          [COOKIE_NAME]: VALID_VISITOR_ID,
        });
        const remembered = issueOrReuseVisitorCookie(previous, false);
        const forgotten = createMemoryCookieStore();
        const next = issueOrReuseVisitorCookie(forgotten, false);
        const nextId = forgotten.values.get(COOKIE_NAME);
        assertEqual(remembered.status, 200, "remembered status");
        assertEqual(next.status, 200, "forgotten status");
        assertEqual(
          previous.values.get(COOKIE_NAME),
          VALID_VISITOR_ID,
          "prior browser kept its id"
        );
        assert(typeof nextId === "string", "forgotten browser received a cookie");
        assert(
          cookie.isAnonymousVisitorId(nextId),
          "new visitor is a UUID v4"
        );
        assert(nextId !== VALID_VISITOR_ID, "forgotten cookie is a new visitor");
        assertSuccessDoesNotEchoId(next.body, nextId, "forgotten");
      },
    },
    {
      name: "invalid remembered cookie is treated as a new visitor",
      run: () => {
        const store = createMemoryCookieStore({
          [COOKIE_NAME]: "not-a-uuid",
        });
        const result = issueOrReuseVisitorCookie(store, true);
        const issued = store.values.get(COOKIE_NAME);
        assertEqual(result.status, 200, "status");
        assert(typeof issued === "string", "replacement cookie written");
        assert(
          cookie.isAnonymousVisitorId(issued),
          "replacement is a UUID v4"
        );
        assert(issued !== "not-a-uuid", "invalid value is not reused");
        assertSuccessDoesNotEchoId(result.body, issued, "invalid");
      },
    },
    {
      name: "different cookie stores receive distinct visitor ids",
      run: () => {
        const browserA = createMemoryCookieStore();
        const browserB = createMemoryCookieStore();
        const resultA = issueOrReuseVisitorCookie(browserA, false);
        const resultB = issueOrReuseVisitorCookie(browserB, false);
        const idA = browserA.values.get(COOKIE_NAME);
        const idB = browserB.values.get(COOKIE_NAME);
        assertEqual(resultA.status, 200, "browser A status");
        assertEqual(resultB.status, 200, "browser B status");
        assert(typeof idA === "string" && typeof idB === "string", "both issued");
        assert(idA !== idB, "two empty browsers must not share an id");
        assertSuccessDoesNotEchoId(resultA.body, idA, "browser A");
        assertSuccessDoesNotEchoId(resultB.body, idB, "browser B");
      },
    },
    {
      name: "cookie store failure returns 500 without echoing a visitor id",
      run: () => {
        const failingStore: AnonymousVisitorCookieStore = {
          get() {
            return undefined;
          },
          set() {
            throw new Error("cookie jar failed");
          },
        };
        const result = issueOrReuseVisitorCookie(failingStore, false);
        assertEqual(result.status, 500, "status");
        assertEqual(result.ok, false, "ok");
        if (!result.ok) {
          assertEqual(typeof result.body.error, "string", "error message");
          assert(
            result.body.error.length > 0,
            "error message is not empty"
          );
        }
        const json = JSON.stringify(result.body);
        assert(
          !jsonHasVisitorIdField(json),
          "error JSON must not include visitor id field names"
        );
        assert(
          !json.includes(CLIENT_SUPPLIED_ID),
          "error JSON must not include a client-supplied id"
        );
      },
    },
    {
      name: "handler never accepts a client-supplied visitor id",
      run: () => {
        const store = createMemoryCookieStore();
        const result = (
          issueOrReuseVisitorCookie as (
            store: AnonymousVisitorCookieStore,
            secure: boolean,
            clientId?: string
          ) => ReturnType<typeof issueOrReuseVisitorCookie>
        )(store, false, CLIENT_SUPPLIED_ID);
        const issued = store.values.get(COOKIE_NAME);
        assertEqual(result.status, 200, "status");
        assert(typeof issued === "string", "cookie was written");
        assert(
          issued !== CLIENT_SUPPLIED_ID,
          "extra client-supplied argument is ignored"
        );
        assertSuccessDoesNotEchoId(result.body, issued, "no client id");
        assertEqual(
          issueOrReuseVisitorCookie.length,
          2,
          "arity is store + secure"
        );
        assert(
          !handlerSource.includes("req.json") &&
            !handlerSource.includes("request.json"),
          "handler does not read a request body"
        );
      },
    },
    {
      name: "handler uses cookie store ensure and does not import auth",
      run: () => {
        assert(
          handlerSource.includes("ensureAnonymousVisitorCookieOnStore"),
          "handler delegates to ensureAnonymousVisitorCookieOnStore"
        );
        assert(
          !handlerSource.includes("auth()") &&
            !handlerSource.includes('from "@/auth"'),
          "handler is unauthenticated"
        );
        assert(!/\bany\b/.test(handlerSource), "handler does not use any");
      },
    },
    {
      name: "route is a public POST wrapper around ensureAnonymousVisitorCookie",
      run: () => {
        assert(
          routeSource.includes("export async function POST"),
          "route exports POST"
        );
        assert(
          !routeSource.includes("export async function GET") &&
            !routeSource.includes("export async function PUT") &&
            !routeSource.includes("export async function PATCH"),
          "visitor cookie stays on POST"
        );
        assert(
          routeSource.includes("await ensureAnonymousVisitorCookie()"),
          "route awaits ensureAnonymousVisitorCookie()"
        );
        assert(
          /NextResponse\.json\(\s*\{\s*ok:\s*true\s*\}/.test(routeSource),
          "route returns { ok: true }"
        );
        assert(
          routeSource.includes("{ status: 500 }") ||
            routeSource.includes("status: 500"),
          "route returns 500 on failure"
        );
        assert(
          !routeSource.includes("auth()") &&
            !routeSource.includes('from "@/auth"'),
          "route is public and does not call auth()"
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
