"use client";

import { useEffect, useRef, useState } from "react";
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

function AccountAvatar({
  image,
  label,
}: {
  image: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = image?.trim() ?? "";
  const usable = /^https?:\/\//i.test(src);

  if (!usable || failed) {
    return (
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700"
      >
        {accountInitial(label)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-7 w-7 rounded-full object-cover"
    />
  );
}

function SignedInAccountMenu({
  signedInUser,
  callbackUrl,
}: {
  signedInUser: PublicChatSignedInUser;
  callbackUrl: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const accountLabel =
    signedInUser.name?.trim() || signedInUser.email?.trim() || "Signed in";

  useEffect(() => {
    function closeIfOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (!menu || !open) return;
      const target = event.target;
      if (target instanceof Node && menu.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="pressable flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm hover-ok:bg-slate-50"
      >
        <AccountAvatar
          key={signedInUser.image ?? ""}
          image={signedInUser.image}
          label={accountLabel}
        />
        <span className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-[0.04em] text-slate-400">
            Signed in as
          </span>
          <span className="block max-w-36 truncate text-sm font-semibold text-slate-700">
            {accountLabel}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={[
            "text-xs text-slate-400 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            open ? "rotate-180" : "",
          ].join(" ")}
        >
          ▾
        </span>
      </button>

      <div
        role="menu"
        inert={!open}
        className={[
          "absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl",
          "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none motion-reduce:transition-opacity",
          open
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-[0.97] opacity-0",
        ].join(" ")}
      >
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
          role="menuitem"
          className="pressable mt-1 flex h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-700 hover-ok:bg-slate-50"
        >My sessions</a>
        <button
          type="button"
          role="menuitem"
          onClick={() => void signOut({ callbackUrl })}
          className="pressable flex h-10 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-rose-600 hover-ok:bg-rose-50"
        >Log out</button>
      </div>
    </div>
  );
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
    return (
      <SignedInAccountMenu
        signedInUser={signedInUser}
        callbackUrl={callbackUrl}
      />
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
