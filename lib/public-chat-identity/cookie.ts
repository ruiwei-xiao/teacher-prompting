/**
 * Remember one anonymous visitor id on this browser via an HttpOnly cookie.
 * The id is issued and read on the server; helpers never take a client-supplied id.
 */
import { cookies, headers } from "next/headers";
import type { AnonymousVisitorId } from "./types";

export const ANONYMOUS_VISITOR_COOKIE = "tp_anonymous_visitor_id";

/** Cookie Max-Age: 400 days in seconds. */
const ANONYMOUS_VISITOR_COOKIE_MAX_AGE_SECONDS = 34_560_000;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitorCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
};

/**
 * Minimal cookie jar used by pure helpers so tests can inject a store
 * without a Next.js request. Compatible with next/headers cookies().
 */
export type AnonymousVisitorCookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: VisitorCookieOptions): void;
};

export function visitorCookieOptions(secure: boolean): VisitorCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ANONYMOUS_VISITOR_COOKIE_MAX_AGE_SECONDS,
    secure,
  };
}

export function isAnonymousVisitorId(
  value: string
): value is AnonymousVisitorId {
  return UUID_V4_PATTERN.test(value);
}

export function readAnonymousVisitorIdFromStore(
  store: AnonymousVisitorCookieStore
): AnonymousVisitorId | null {
  const remembered = store.get(ANONYMOUS_VISITOR_COOKIE)?.value;
  if (remembered === undefined || !isAnonymousVisitorId(remembered)) {
    return null;
  }
  return remembered;
}

export function ensureAnonymousVisitorCookieOnStore(
  store: AnonymousVisitorCookieStore,
  secure: boolean
): AnonymousVisitorId {
  const remembered = readAnonymousVisitorIdFromStore(store);
  if (remembered !== null) {
    return remembered;
  }

  const issued = crypto.randomUUID();
  store.set(
    ANONYMOUS_VISITOR_COOKIE,
    issued,
    visitorCookieOptions(secure)
  );
  return issued;
}

function requestIsHttps(headerList: {
  get(name: string): string | null;
}): boolean {
  const forwarded = headerList.get("x-forwarded-proto");
  if (!forwarded) {
    return false;
  }
  const proto = forwarded.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
}

function asVisitorCookieStore(
  store: Awaited<ReturnType<typeof cookies>>
): AnonymousVisitorCookieStore {
  return {
    get(name) {
      const cookie = store.get(name);
      return cookie ? { value: cookie.value } : undefined;
    },
    set(name, value, options) {
      store.set(name, value, options);
    },
  };
}

export async function readAnonymousVisitorId(): Promise<AnonymousVisitorId | null> {
  const store = await cookies();
  return readAnonymousVisitorIdFromStore(asVisitorCookieStore(store));
}

export async function ensureAnonymousVisitorCookie(): Promise<AnonymousVisitorId> {
  const store = await cookies();
  const headerList = await headers();
  return ensureAnonymousVisitorCookieOnStore(
    asVisitorCookieStore(store),
    requestIsHttps(headerList)
  );
}
