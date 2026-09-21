/**
 * Visitor id stamped onto published-chat recordings.
 * Anonymous published visitors get a cookie issued or reused.
 * Signed-in published turns read an existing cookie and do not issue one.
 * Non-published requests, including editor-test, return null and do not
 * write a cookie. Identity fields on `recording` are never read.
 */
import {
  ensureAnonymousVisitorCookie,
  ensureAnonymousVisitorCookieOnStore,
  readAnonymousVisitorId,
  readAnonymousVisitorIdFromStore,
  type AnonymousVisitorCookieStore,
} from "./cookie";

export type ResolvePublicChatVisitorIdInput = {
  isPublishedRequest: boolean;
  /**
   * Signed-in account id from the chat request. Null or omitted means the
   * visitor is anonymous.
   */
  userId?: string | null;
  /**
   * Tests inject a cookie jar. The chat route omits this and uses the
   * request cookie store.
   */
  store?: AnonymousVisitorCookieStore;
  secure?: boolean;
  /**
   * Raw recording JSON may be supplied by callers. Visitor identity fields
   * on it are never read.
   */
  recording?: unknown;
};

function hasSignedInUser(
  userId: string | null | undefined
): userId is string {
  return typeof userId === "string" && userId.trim().length > 0;
}

export async function resolvePublicChatVisitorId(
  input: ResolvePublicChatVisitorIdInput
): Promise<string | null> {
  if (!input.isPublishedRequest) {
    return null;
  }

  if (hasSignedInUser(input.userId)) {
    if (input.store) {
      return readAnonymousVisitorIdFromStore(input.store);
    }
    return readAnonymousVisitorId();
  }

  if (input.store) {
    return ensureAnonymousVisitorCookieOnStore(
      input.store,
      input.secure === true
    );
  }

  return ensureAnonymousVisitorCookie();
}
