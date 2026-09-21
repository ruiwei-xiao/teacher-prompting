/**
 * Public-chat anonymous visitor identity types.
 */

/**
 * UUID v4 anonymous visitor identity. Not a user id and not a display name.
 */
export type AnonymousVisitorId = string;

/**
 * Audit that a visitor id was used by a signed-in user.
 * Primary key is (anonymousVisitorId, userId); the same visitor may
 * later also link to a different user.
 */
export type AnonymousVisitorLink = {
  anonymousVisitorId: AnonymousVisitorId;
  userId: string;
  linkedAt: string;
};

export type AnonymousVisitorLinksFileData = {
  links: AnonymousVisitorLink[];
};

/**
 * Result of claiming a remembered anonymous visitor for a signed-in user.
 * Missing cookie yields no-visitor without failing the user.
 */
export type ClaimAnonymousVisitorResult =
  | { status: "claimed"; visitorId: string; attributedCount: number }
  | { status: "no-visitor" };
