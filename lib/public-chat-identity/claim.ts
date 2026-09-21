/**
 * ClaimAnonymousVisitor — on sign-in, remember the cookie visitor and
 * promote still-unattributed public-chat sessions to that user.
 *
 * Missing cookie yields no-visitor without failing the user. Repeats are
 * idempotent: already-attributed rows stay with the earlier account.
 */
import { getDisplayProfiles, getUserById } from "@/lib/auth/user-store";
import {
  attributeSessionsForVisitor,
  type AttributeSessionsForVisitorInput,
} from "@/lib/chat-session-store/store";
import { readAnonymousVisitorId } from "./cookie";
import { rememberAnonymousVisitorLink } from "./store";
import type { ClaimAnonymousVisitorResult } from "./types";

export type { ClaimAnonymousVisitorResult };

export type ClaimAnonymousVisitorDeps = {
  readVisitorId?: () => Promise<string | null>;
  rememberLink?: (anonymousVisitorId: string, userId: string) => Promise<void>;
  attributeSessions?: (
    input: AttributeSessionsForVisitorInput
  ) => Promise<{ attributedCount: number }>;
  resolveDisplayName?: (userId: string) => Promise<string | null>;
};

export async function claimAnonymousVisitorForUser(
  userId: string,
  deps: ClaimAnonymousVisitorDeps = {}
): Promise<ClaimAnonymousVisitorResult> {
  const readVisitorId = deps.readVisitorId ?? readAnonymousVisitorId;
  const visitorId = await readVisitorId();
  if (!visitorId) {
    return { status: "no-visitor" };
  }

  const rememberLink = deps.rememberLink ?? rememberAnonymousVisitorLink;
  await rememberLink(visitorId, userId);

  const participantName = await resolveParticipantName(userId, deps);
  const attribute = deps.attributeSessions ?? attributeSessionsForVisitor;
  const { attributedCount } = await attribute({
    anonymousVisitorId: visitorId,
    userId,
    participantName,
  });

  return { status: "claimed", visitorId, attributedCount };
}

async function resolveParticipantName(
  userId: string,
  deps: ClaimAnonymousVisitorDeps
): Promise<string> {
  const resolve = deps.resolveDisplayName ?? defaultResolveDisplayName;
  try {
    const resolved = await resolve(userId);
    return resolved?.trim() || "";
  } catch (error) {
    console.error("chat session display name lookup failed:", error);
    return "";
  }
}

async function defaultResolveDisplayName(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  const fromUser = user?.name?.trim();
  if (fromUser) {
    return fromUser;
  }
  const profiles = await getDisplayProfiles([userId]);
  return profiles.get(userId)?.name?.trim() || null;
}
