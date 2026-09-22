"use client";

import { signOut } from "next-auth/react";
import PublicChatSignInControl from "./PublicChatSignInControl";

export type PublicChatSignedInUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

function accountInitial(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}

export default function PublicChatIdentityStatus({
  signedInUser,
  anonymous,
  callbackUrl,
  appId,
  sessionId,
  googleEnabled,
  microsoftEnabled,
  onAnonymousLogIn,
}: {
  signedInUser: PublicChatSignedInUser | null;
  anonymous: boolean;
  callbackUrl: string;
  appId: string;
  sessionId: string;
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  onAnonymousLogIn: () => void;
}) {
  if (signedInUser) {
    const accountLabel =
      signedInUser.name?.trim() ||
      signedInUser.email?.trim() ||
      "Signed in";

    return (
      <details className="relative shrink-0">
        <summary className="pressable flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm hover-ok:bg-slate-50">
          {signedInUser.image ? (
            <img
              src={signedInUser.image}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700"
            >
              {accountInitial(accountLabel)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Signed in as
            </span>
            <span className="block max-w-36 truncate text-sm font-semibold text-slate-700">
              {accountLabel}
            </span>
          </span>
          <span aria-hidden="true" className="text-xs text-slate-400">
            ▾
          </span>
        </summary>

        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-800">
              {accountLabel}
            </p>
            {signedInUser.email ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {signedInUser.email}
              </p>
            ) : null}
          </div>
          <a
            href="/sessions"
            className="pressable mt-1 flex h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-700 hover-ok:bg-slate-50"
          >My sessions</a>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl })}
            className="pressable flex h-10 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-rose-600 hover-ok:bg-rose-50"
          >Log out</button>
        </div>
      </details>
    );
  }

  if (!anonymous) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1.5">
      <span className="inline-flex h-9 items-center rounded-lg px-2 text-sm font-medium text-slate-600">Anonymous</span>
      <PublicChatSignInControl
        variant="quiet"
        callbackUrl={callbackUrl}
        appId={appId}
        sessionId={sessionId}
        googleEnabled={googleEnabled}
        microsoftEnabled={microsoftEnabled}
        onQuietSignIn={onAnonymousLogIn}
      />
    </div>
  );
}
