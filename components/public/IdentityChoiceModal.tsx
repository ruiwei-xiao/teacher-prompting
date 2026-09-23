"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANONYMOUS_ACTION_LABEL,
  IDENTITY_CHOICE_TITLE,
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const previousFocus = document.activeElement;
    const siblings = Array.from(overlay.parentElement?.children ?? []).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay
    );
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => {
      element.inert = true;
    });
    loginRef.current?.focus();

    function keepFocusInside(event: FocusEvent) {
      if (!dialog?.contains(event.target as Node)) {
        dialog?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
    }

    function trapTab(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
      );
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("focusin", keepFocusInside);
    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("focusin", keepFocusInside);
      document.removeEventListener("keydown", trapTab);
      siblings.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (pending) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
    }
  }, [pending]);

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
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-choice-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="identity-choice-title"
          className="text-lg font-semibold tracking-[-0.01em] text-slate-900"
        >
          {IDENTITY_CHOICE_TITLE}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {REMEMBERED_VISITOR_SENTENCE} {LATER_LINKING_SENTENCE}
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          <button
            ref={loginRef}
            type="button"
            onClick={onLogIn}
            disabled={pending}
            className="pressable flex h-12 w-full items-center justify-center rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {LOGIN_ACTION_LABEL}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleContinueAnonymously();
            }}
            disabled={pending}
            className="pressable flex h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
