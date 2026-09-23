/**
 * HTTP contract for issuing or reusing the anonymous visitor cookie.
 * The visitor id is taken only from the cookie store; it is never echoed
 * in the JSON body and is never accepted from a client-supplied argument.
 */
import {
  ensureAnonymousVisitorCookieOnStore,
  type AnonymousVisitorCookieStore,
} from "./cookie";

export type VisitorCookieApiSuccess = { ok: true };
export type VisitorCookieApiError = { error: string };

export type VisitorCookieApiResult =
  | { ok: true; status: 200; body: VisitorCookieApiSuccess }
  | { ok: false; status: 500; body: VisitorCookieApiError };

export function issueOrReuseVisitorCookie(
  store: AnonymousVisitorCookieStore,
  secure: boolean
): VisitorCookieApiResult {
  try {
    ensureAnonymousVisitorCookieOnStore(store, secure);
    return { ok: true, status: 200, body: { ok: true } };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to issue visitor cookie";
    return { ok: false, status: 500, body: { error: message } };
  }
}
