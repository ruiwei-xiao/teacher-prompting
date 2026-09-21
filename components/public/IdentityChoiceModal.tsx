"use client";

import {
  ANONYMOUS_ACTION_LABEL,
  LATER_LINKING_SENTENCE,
  LOGIN_ACTION_LABEL,
  REMEMBERED_VISITOR_SENTENCE,
} from "@/lib/public-chat-identity/copy";

const VISITOR_COOKIE_URL = "/api/public-chat/visitor";
const noChoice = null;

export function identityChoiceForDismissal(
  _dismissal: "overlay-click" | "escape-key"
): null {
  return noChoice;
}

export async function continueAnonymouslyAfterVisitorCookie(
  fetchImpl: (
    input: string,
    init: { method: "POST" }
  ) => Promise<{ ok: boolean }>,
  onContinueAnonymously: () => void
): Promise<boolean> {
  try {
    const response = await fetchImpl(VISITOR_COOKIE_URL, {
      method: "POST",
    });
    if (!response.ok) {
      return false;
    }
    onContinueAnonymously();
    return true;
  } catch {
    return false;
  }
}

export default function IdentityChoiceModal({
  onLogIn,
  onContinueAnonymously,
}: {
  onLogIn: () => void;
  onContinueAnonymously: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          {REMEMBERED_VISITOR_SENTENCE}
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
          {LATER_LINKING_SENTENCE}
        </p>
        <button
          type="button"
          onClick={onLogIn}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-sky-600 text-sm font-semibold text-white"
        >
          {LOGIN_ACTION_LABEL}
        </button>
        <button
          type="button"
          onClick={() => {
            void continueAnonymouslyAfterVisitorCookie(
              fetch,
              onContinueAnonymously
            );
          }}
          className="mt-3 w-full text-sm text-slate-500 underline"
        >
          {ANONYMOUS_ACTION_LABEL}
        </button>
      </div>
    </div>
  );
}
