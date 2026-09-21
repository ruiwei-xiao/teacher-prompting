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
        className="text-sm text-slate-500 underline"
      >Log in</button>
    );
  }

  return (
    <SignInPanel
      callbackUrl={callbackUrl}
      googleEnabled={googleEnabled}
      microsoftEnabled={microsoftEnabled}
    />
  );
}
