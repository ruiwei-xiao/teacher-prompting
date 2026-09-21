/**
 * English IdentityChoiceModal strings. This module is the single source
 * of identity-gate copy used by the public chat gate.
 */

/** Prominent primary action: start the existing sign-in flow. */
export const LOGIN_ACTION_LABEL = "Log in to continue";

/** Quieter secondary action: continue without an account. */
export const ANONYMOUS_ACTION_LABEL = "Continue anonymously";

/** Requirement 7.1: anonymous use still remembers a visitor identity. */
export const REMEMBERED_VISITOR_SENTENCE =
  "Continuing anonymously still records a remembered visitor identity on this browser.";

/** Requirement 7.2: later sign-in associates those chats with the account. */
export const LATER_LINKING_SENTENCE =
  "Signing in later associates prior chats from that visitor identity with your account.";
