/**
 * Task-local verification for anonymous visitor cookie helpers (task 1.2).
 * Covers UUID issue/reuse, invalid or forgotten cookies as a new visitor,
 * HttpOnly Lax path-root options, and never accepting a client-supplied id.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-cookie.ts
 */
import fs from "fs/promises";
import path from "path";
import type {
  AnonymousVisitorCookieStore,
  VisitorCookieOptions,
} from "../lib/public-chat-identity/cookie";

type Check = { name: string; run: () => void | Promise<void> };

const COOKIE_NAME = "tp_anonymous_visitor_id";
const COOKIE_MAX_AGE_SECONDS = 34_560_000;
const VALID_VISITOR_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_VALID_VISITOR_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const CLIENT_SUPPLIED_ID = "11111111-1111-4111-8111-111111111111";

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

function parameterList(source: string, functionName: string): string {
  const match = source.match(
    new RegExp(
      `(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(([^)]*)\\)`
    )
  );
  assert(match !== null, `${functionName} must be a function declaration`);
  return match[1];
}

async function main() {
  const cookie = await import("../lib/public-chat-identity/cookie");
  const cookieSource = await readSource("lib/public-chat-identity/cookie.ts");
  const typesSource = await readSource("lib/public-chat-identity/types.ts");

  const checks: Check[] = [
    {
      name: "cookie name is tp_anonymous_visitor_id",
      run: () => {
        assertEqual(
          cookie.ANONYMOUS_VISITOR_COOKIE,
          COOKIE_NAME,
          "ANONYMOUS_VISITOR_COOKIE"
        );
      },
    },
    {
      name: "visitorCookieOptions are HttpOnly Lax path-root and 400-day max-age",
      run: () => {
        const httpsOptions = cookie.visitorCookieOptions(true);
        assertEqual(httpsOptions.httpOnly, true, "httpOnly");
        assertEqual(httpsOptions.sameSite, "lax", "sameSite");
        assertEqual(httpsOptions.path, "/", "path");
        assertEqual(httpsOptions.maxAge, COOKIE_MAX_AGE_SECONDS, "maxAge");
        assertEqual(httpsOptions.secure, true, "secure on HTTPS");

        const httpOptions = cookie.visitorCookieOptions(false);
        assertEqual(httpOptions.secure, false, "secure false off HTTPS");
        assertEqual(httpOptions.httpOnly, true, "httpOnly on HTTP");
        assertEqual(httpOptions.sameSite, "lax", "sameSite on HTTP");
        assertEqual(httpOptions.path, "/", "path on HTTP");
        assertEqual(httpOptions.maxAge, COOKIE_MAX_AGE_SECONDS, "maxAge on HTTP");
      },
    },
    {
      name: "isAnonymousVisitorId accepts UUID v4 and rejects invalid values",
      run: () => {
        assert(
          cookie.isAnonymousVisitorId(VALID_VISITOR_ID),
          "canonical UUID v4 is valid"
        );
        assert(
          cookie.isAnonymousVisitorId(OTHER_VALID_VISITOR_ID),
          "second UUID v4 is valid"
        );
        assert(
          cookie.isAnonymousVisitorId("550E8400-E29B-41D4-A716-446655440000"),
          "uppercase UUID v4 is valid"
        );
        assert(
          !cookie.isAnonymousVisitorId(""),
          "empty string is invalid"
        );
        assert(
          !cookie.isAnonymousVisitorId("not-a-uuid"),
          "garbage is invalid"
        );
        assert(
          !cookie.isAnonymousVisitorId("550e8400-e29b-11d4-a716-446655440000"),
          "UUID v1 is invalid"
        );
        assert(
          !cookie.isAnonymousVisitorId("550e8400-e29b-41d4-c716-446655440000"),
          "wrong RFC 4122 variant is invalid"
        );
        assert(
          !cookie.isAnonymousVisitorId("550e8400e29b41d4a716446655440000"),
          "UUID without hyphens is invalid"
        );
        assert(
          !cookie.isAnonymousVisitorId(` ${VALID_VISITOR_ID} `),
          "padded UUID is invalid"
        );
      },
    },
    {
      name: "ensure issues a UUID visitor id when none exists",
      run: () => {
        const store = createMemoryCookieStore();
        const issued = cookie.ensureAnonymousVisitorCookieOnStore(store, false);
        assert(
          cookie.isAnonymousVisitorId(issued),
          "issued value is a UUID v4"
        );
        assertEqual(
          store.values.get(COOKIE_NAME),
          issued,
          "cookie stores the issued id"
        );
        assert(store.lastSet !== null, "cookie was written");
        assertEqual(store.lastSet.name, COOKIE_NAME, "set name");
        assertEqual(store.lastSet.value, issued, "set value");
        assertEqual(
          store.lastSet.options,
          cookie.visitorCookieOptions(false),
          "set options"
        );
      },
    },
    {
      name: "ensure reuses a valid remembered visitor id",
      run: () => {
        const store = createMemoryCookieStore({
          [COOKIE_NAME]: VALID_VISITOR_ID,
        });
        const reused = cookie.ensureAnonymousVisitorCookieOnStore(store, true);
        assertEqual(reused, VALID_VISITOR_ID, "reused remembered id");
        assertEqual(
          store.values.get(COOKIE_NAME),
          VALID_VISITOR_ID,
          "cookie still holds the remembered id"
        );
        assertEqual(store.setCount, 0, "reuse does not overwrite the cookie");
      },
    },
    {
      name: "ensure treats a forgotten cookie as a new visitor",
      run: () => {
        const previous = createMemoryCookieStore({
          [COOKIE_NAME]: VALID_VISITOR_ID,
        });
        const remembered = cookie.ensureAnonymousVisitorCookieOnStore(
          previous,
          false
        );
        const forgotten = createMemoryCookieStore();
        const next = cookie.ensureAnonymousVisitorCookieOnStore(
          forgotten,
          false
        );
        assertEqual(remembered, VALID_VISITOR_ID, "prior browser kept its id");
        assert(
          cookie.isAnonymousVisitorId(next),
          "forgotten browser received a UUID v4"
        );
        assert(
          next !== remembered,
          "forgotten cookie is not the previous visitor"
        );
      },
    },
    {
      name: "ensure treats an invalid remembered value as a new visitor",
      run: () => {
        const store = createMemoryCookieStore({
          [COOKIE_NAME]: "not-a-uuid",
        });
        const issued = cookie.ensureAnonymousVisitorCookieOnStore(store, true);
        assert(
          cookie.isAnonymousVisitorId(issued),
          "replacement is a UUID v4"
        );
        assert(issued !== "not-a-uuid", "invalid value is not reused");
        assertEqual(
          store.values.get(COOKIE_NAME),
          issued,
          "invalid cookie is replaced"
        );
        assert(store.lastSet !== null, "replacement was written");
        assertEqual(
          store.lastSet.options,
          cookie.visitorCookieOptions(true),
          "replacement uses HTTPS options"
        );
      },
    },
    {
      name: "different cookie stores receive distinct visitor ids",
      run: () => {
        const browserA = createMemoryCookieStore();
        const browserB = createMemoryCookieStore();
        const idA = cookie.ensureAnonymousVisitorCookieOnStore(browserA, false);
        const idB = cookie.ensureAnonymousVisitorCookieOnStore(browserB, false);
        assert(idA !== idB, "two empty browsers must not share an id");
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(browserA),
          idA,
          "browser A keeps its own id"
        );
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(browserB),
          idB,
          "browser B keeps its own id"
        );
      },
    },
    {
      name: "read returns a valid cookie and null when missing or invalid",
      run: () => {
        const remembered = createMemoryCookieStore({
          [COOKIE_NAME]: VALID_VISITOR_ID,
        });
        const missing = createMemoryCookieStore();
        const invalid = createMemoryCookieStore({
          [COOKIE_NAME]: "nope",
        });
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(remembered),
          VALID_VISITOR_ID,
          "valid cookie"
        );
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(missing),
          null,
          "missing cookie"
        );
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(invalid),
          null,
          "invalid cookie"
        );
      },
    },
    {
      name: "a browser without the cookie cannot attach another browser's visitor",
      run: () => {
        const originBrowser = createMemoryCookieStore({
          [COOKIE_NAME]: VALID_VISITOR_ID,
        });
        const otherBrowser = createMemoryCookieStore();
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(originBrowser),
          VALID_VISITOR_ID,
          "origin browser still has its visitor"
        );
        assertEqual(
          cookie.readAnonymousVisitorIdFromStore(otherBrowser),
          null,
          "other browser has no visitor to attach"
        );
      },
    },
    {
      name: "helpers never accept a client-supplied visitor id",
      run: () => {
        const store = createMemoryCookieStore();
        const issued = (
          cookie.ensureAnonymousVisitorCookieOnStore as (
            store: AnonymousVisitorCookieStore,
            secure: boolean,
            clientId?: string
          ) => string
        )(store, false, CLIENT_SUPPLIED_ID);
        assert(
          issued !== CLIENT_SUPPLIED_ID,
          "extra client-supplied argument is ignored"
        );
        assert(
          cookie.isAnonymousVisitorId(issued),
          "issued id is generated, not client-supplied"
        );

        const ensureParams = parameterList(
          cookieSource,
          "ensureAnonymousVisitorCookieOnStore"
        );
        const ensureParamNames = ensureParams
          .split(",")
          .map((part) => part.trim().split(":")[0]?.trim() ?? "")
          .filter((name) => name.length > 0);
        assertEqual(
          ensureParamNames,
          ["store", "secure"],
          "store ensure parameters"
        );
        assert(
          !ensureParamNames.some((name) =>
            /^(visitorId|anonymousVisitorId|clientId|id)$/i.test(name)
          ),
          "store ensure does not take a visitor id argument"
        );
        const nextEnsureParams = parameterList(
          cookieSource,
          "ensureAnonymousVisitorCookie"
        );
        assertEqual(
          nextEnsureParams.trim(),
          "",
          "Next ensure wrapper takes no arguments"
        );
        const nextReadParams = parameterList(
          cookieSource,
          "readAnonymousVisitorId"
        );
        assertEqual(
          nextReadParams.trim(),
          "",
          "Next read wrapper takes no arguments"
        );
        assertEqual(
          cookie.ensureAnonymousVisitorCookie.length,
          0,
          "ensureAnonymousVisitorCookie arity is 0"
        );
        assertEqual(
          cookie.readAnonymousVisitorId.length,
          0,
          "readAnonymousVisitorId arity is 0"
        );
        assertEqual(
          cookie.ensureAnonymousVisitorCookieOnStore.length,
          2,
          "store ensure arity is store + secure"
        );
      },
    },
    {
      name: "cookie module wraps next/headers cookies() and uses UUID v4",
      run: () => {
        assert(
          cookieSource.includes('from "next/headers"') ||
            cookieSource.includes("from 'next/headers'"),
          "cookie.ts imports next/headers"
        );
        assert(
          cookieSource.includes("cookies()"),
          "cookie.ts calls cookies()"
        );
        assert(
          cookieSource.includes("randomUUID"),
          "cookie.ts issues UUID via randomUUID"
        );
        assert(
          /httpOnly:\s*true/.test(cookieSource),
          "httpOnly true is in source"
        );
        assert(
          /sameSite:\s*"lax"/.test(cookieSource),
          'sameSite "lax" is in source'
        );
        assert(/path:\s*"\/"/.test(cookieSource), 'path "/" is in source');
        assert(
          cookieSource.includes("34_560_000") ||
            cookieSource.includes("34560000"),
          "400-day max-age is in source"
        );
        assert(!/\bany\b/.test(cookieSource), "cookie.ts does not use any");
        assert(
          typeof cookie.readAnonymousVisitorId === "function",
          "readAnonymousVisitorId is exported"
        );
        assert(
          typeof cookie.ensureAnonymousVisitorCookie === "function",
          "ensureAnonymousVisitorCookie is exported"
        );
      },
    },
    {
      name: "visitor id type lives in types.ts as UUID v4 identity",
      run: () => {
        assert(
          typesSource.includes("AnonymousVisitorId"),
          "AnonymousVisitorId is declared"
        );
        assert(
          /UUID v4/i.test(typesSource),
          "types.ts documents UUID v4"
        );
        assert(!/\bany\b/.test(typesSource), "types.ts does not use any");
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
