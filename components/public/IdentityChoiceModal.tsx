"use client";

import { useState } from "react";
import {
  ANONYMOUS_ACTION_LABEL,
  LATER_LINKING_SENTENCE,
  LOGIN_ACTION_LABEL,
  REMEMBERED_VISITOR_SENTENCE,
} from "@/lib/public-chat-identity/copy";

const NO_IDENTITY_CHOICE: null = null;

export type IgnoredDismissal = "overlay-click" | "escape-key";

/**
 * Overlay clicks and the escape key are not an identity choice.
 * The modal does not listen for either gesture.
 */
export function identityChoiceForDismissal(
  dismissal: IgnoredDismissal
): null {
  const ignored: Record<IgnoredDismissal, null> = {
    "overlay-click": NO_IDENTITY_CHOICE,
    "escape-key": NO_IDENTITY_CHOICE,
  };
  return ignored[dismissal];
}

export async function continueAnonymouslyAfterVisitorCookie(
  fetchImpl: (
    input: string,
    init: { method: "POST" }
  ) => Promise<{ ok: boolean }>,
  onContinueAnonymously: () => void
): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/public-chat/visitor", {
      method: "POST",
    });
    if (!response.ok) {
      return false;
    }
  } catch {
    return false;
  }
  onContinueAnonymously();
  return true;
}

export type IdentityChoiceModalProps = {
  onLogIn: () => void;
  onContinueAnonymously: () => void;
};

export default function IdentityChoiceModal({
  onLogIn,
  onContinueAnonymously,
}: IdentityChoiceModalProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleContinueAnonymously() {
    if (pending) {
      return;
    }
    setPending(true);
    setFailed(false);
    const unlocked = await continueAnonymouslyAfterVisitorCookie(
      (input, init) => fetch(input, init),
      onContinueAnonymously
    );
    setPending(false);
    if (!unlocked) {
      setFailed(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-choice-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="identity-choice-title"
          className="text-lg font-semibold text-slate-900"
        >
          Choose how to continue
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {REMEMBERED_VISITOR_SENTENCE}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {LATER_LINKING_SENTENCE}
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          <button
            type="button"
            onClick={onLogIn}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            {LOGIN_ACTION_LABEL}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleContinueAnonymously();
            }}
            disabled={pending}
            className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline disabled:opacity-60"
          >
            {ANONYMOUS_ACTION_LABEL}
          </button>
        </div>
        {failed ? (
          <p className="mt-3 text-center text-sm text-red-700" role="alert">
            Could not continue anonymously. Try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
