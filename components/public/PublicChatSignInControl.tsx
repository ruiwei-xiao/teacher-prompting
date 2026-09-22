"use client";

import SignInPanel from "@/components/auth/SignInPanel";
import {
  rememberPublicChatResumeInSession,
  type PublicChatResume,
} from "./conversation-resume";

export default function PublicChatSignInControl({
  callbackUrl,
  appId,
  sessionId,
  googleEnabled,
  microsoftEnabled,
  variant,
  onQuietSignIn,
}: {
  callbackUrl: string;
  appId: string;
  sessionId: string;
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  variant: "panel" | "quiet";
  onQuietSignIn?: () => void;
}) {
  const resume: PublicChatResume = { appId, sessionId };

  if (variant === "panel") {
    // Write before SignInPanel can call signIn. A click cannot happen
    // until this render has stored the in-progress conversation.
    rememberPublicChatResumeInSession(resume);
  }

  if (variant === "quiet") {
    return (
      <button
        type="button"
        onClick={() => {
          rememberPublicChatResumeInSession(resume);
          onQuietSignIn?.();
        }}
        className="pressable inline-flex h-9 items-center rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-700 shadow-sm hover-ok:bg-sky-50"
      >Log in</button>
    );
  }

  return (
    <SignInPanel
      callbackUrl={callbackUrl}
      googleEnabled={googleEnabled}
      microsoftEnabled={microsoftEnabled}
      appearance="light"
      description="Continue this chat with your account."
    />
  );
}
