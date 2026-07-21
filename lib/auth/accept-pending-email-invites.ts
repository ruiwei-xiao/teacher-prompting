/**
 * Auth bootstrap for educator Workspace email invites (Req 2.1, 2.3 / Task 5.1).
 * Call from Auth.js sign-in / JWT callbacks when user id + email are available.
 */
import { acceptPendingEmailInvitesForUser } from "@/lib/workspace-store/store";

/**
 * Accept pending email Workspace invites for the signed-in user.
 * Returns accepted workspace ids, or [] when userId/email is missing.
 */
export async function acceptPendingEmailInvitesOnSignIn(
  userId: string | null | undefined,
  email: string | null | undefined
): Promise<string[]> {
  const id = typeof userId === "string" ? userId.trim() : "";
  const addr = typeof email === "string" ? email.trim() : "";
  if (!id || !addr) {
    return [];
  }
  return acceptPendingEmailInvitesForUser(id, addr);
}
