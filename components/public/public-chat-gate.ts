/**
 * Participation rules for the published public-chat identity gate.
 * A remembered visitor cookie never counts as a choice.
 */

export type PublicChatGateState = {
  isSignedIn: boolean;
  continuedAnonymously: boolean;
  signingIn: boolean;
};

export function publicChatCanParticipate(state: PublicChatGateState): boolean {
  return state.isSignedIn || state.continuedAnonymously;
}

export function publicChatShowsIdentityGate(state: PublicChatGateState): boolean {
  return (
    !state.isSignedIn && !state.continuedAnonymously && !state.signingIn
  );
}

export function publicChatShouldClaimOnMount(isSignedIn: boolean): boolean {
  return isSignedIn;
}

export function publicChatCallbackPath(
  routeSegment: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    }
  }
  const search = query.toString();
  const path = `/chat/${routeSegment}`;
  return search ? `${path}?${search}` : path;
}
