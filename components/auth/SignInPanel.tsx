"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPanel({
  callbackUrl,
  googleEnabled,
  microsoftEnabled,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  microsoftEnabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const socialConfigured = googleEnabled || microsoftEnabled;

  async function handleSocial(provider: "google" | "microsoft-entra-id") {
    setBusy(true);
    setError("");
    try {
      await signIn(provider, { callbackUrl });
    } catch (e: any) {
      setError(e?.message || "Failed to start sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-sky-700">
        Pedagogical Agent Builder
      </div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Continue with Google or Microsoft to access your bots.
      </p>

      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={() => void handleSocial("google")}
          disabled={busy || !googleEnabled}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.82-.07-1.43-.22-2.07H12v3.92h5.5c-.11.97-.73 2.43-2.1 3.41l-.02.13 3.07 2.33.21.02c1.92-1.74 2.94-4.3 2.94-7.74z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.96-.87 6.62-2.36l-3.26-2.49c-.87.6-2.03 1.02-3.36 1.02-2.65 0-4.9-1.74-5.7-4.14l-.13.01-3.19 2.42-.04.12C4.6 19.84 8.02 22 12 22z"
            />
            <path
              fill="#FBBC05"
              d="M6.3 14.03A5.93 5.93 0 016 12c0-.7.12-1.37.3-2.03l-.01-.14-3.23-2.46-.11.05A9.83 9.83 0 002 12c0 1.59.38 3.09 1.05 4.42l3.25-2.39z"
            />
            <path
              fill="#EA4335"
              d="M12 5.83c1.67 0 2.8.71 3.45 1.3l2.52-2.42C16.95 3.78 14.7 3 12 3 8.02 3 4.6 5.16 3.05 8.58L6.3 11c.8-2.4 3.05-4.17 5.7-4.17z"
            />
          </svg>
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => void handleSocial("microsoft-entra-id")}
          disabled={busy || !microsoftEnabled}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
            <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
            <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
            <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
          </svg>
          Continue with Microsoft
        </button>

        {!socialConfigured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Google and Microsoft sign-in are not configured yet. Add the auth
            provider environment variables to enable them.
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
