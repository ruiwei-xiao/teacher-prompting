/**
 * HTTP contract for claiming a remembered anonymous visitor.
 * The visitor id is taken only from the cookie reader passed into the
 * claimer. It is never echoed in the JSON body and is never accepted
 * from a client-supplied argument.
 */
import {
  claimAnonymousVisitorForUser,
  type ClaimAnonymousVisitorDeps,
  type ClaimAnonymousVisitorResult,
} from "./claim";

export type ClaimVisitorIdentityDeps = {
  readVisitorId?: () => Promise<string | null>;
  claimForUser?: (
    userId: string,
    deps?: ClaimAnonymousVisitorDeps
  ) => Promise<ClaimAnonymousVisitorResult>;
};

export type ClaimVisitorIdentitySuccess = {
  ok: true;
  status: "claimed" | "no-visitor";
};

export type ClaimVisitorIdentityError = {
  error: string;
};

export type ClaimVisitorIdentityResult =
  | { ok: true; status: 200; body: ClaimVisitorIdentitySuccess }
  | { ok: false; status: 401 | 500; body: ClaimVisitorIdentityError };

const UNAUTHENTICATED_ERROR = "Sign in required";
const CLAIM_FAILED_ERROR = "Failed to claim visitor history";

export async function claimVisitorIdentity(
  userId: string | null,
  deps?: ClaimVisitorIdentityDeps
): Promise<ClaimVisitorIdentityResult> {
  if (!userId) {
    return {
      ok: false,
      status: 401,
      body: { error: UNAUTHENTICATED_ERROR },
    };
  }

  const claimForUser = deps?.claimForUser ?? claimAnonymousVisitorForUser;

  try {
    const claimed = await claimForUser(userId, {
      readVisitorId: deps?.readVisitorId,
    });
    if (claimed.status === "claimed") {
      return {
        ok: true,
        status: 200,
        body: { ok: true, status: "claimed" },
      };
    }
    return {
      ok: true,
      status: 200,
      body: { ok: true, status: "no-visitor" },
    };
  } catch (error: unknown) {
    console.error("Failed to claim anonymous visitor history:", error);
    return {
      ok: false,
      status: 500,
      body: { error: CLAIM_FAILED_ERROR },
    };
  }
}
