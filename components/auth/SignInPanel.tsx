"use client";

import { useMemo, useState } from "react";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(
    () => (mode === "signin" ? "Sign in" : "Create account"),
    [mode]
  );
  const socialConfigured = googleEnabled || microsoftEnabled;

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "signup") {
        const registerRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        const registerBody = await registerRes.json();
        if (!registerRes.ok) {
          throw new Error(registerBody?.error || "Failed to create account.");
        }
      }

      if (mode === "signin") {
        const checkRes = await fetch("/api/auth/check-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const checkBody = await checkRes.json();
        if (!checkRes.ok) {
          throw new Error(
            checkBody?.error || "Unable to sign in with those credentials."
          );
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        throw new Error("Invalid email or password.");
      }

      window.location.href = result?.url || callbackUrl;
    } catch (e: any) {
      setError(e?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

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
        Pedagogical Prompting Tutor
      </div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use Google, Microsoft, or an email and password to continue.
      </p>

      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={() => void handleSocial("google")}
          disabled={busy || !googleEnabled}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => void handleSocial("microsoft-entra-id")}
          disabled={busy || !microsoftEnabled}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue with Microsoft
        </button>

        {!socialConfigured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Google and Microsoft sign-in are not configured yet. Add the auth
            provider environment variables to enable them.
          </div>
        )}
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        <span>or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handleCredentialsSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              disabled={busy}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            type="password"
            className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            disabled={busy}
            required
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl bg-sky-600 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy
            ? "Please wait..."
            : mode === "signin"
              ? "Sign in with email"
              : "Create account"}
        </button>
      </form>

      <div className="mt-5 text-sm text-slate-600">
        {mode === "signin" ? "Need an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setError("");
            setMode(mode === "signin" ? "signup" : "signin");
          }}
          className="font-medium text-sky-700 hover:text-sky-800"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
