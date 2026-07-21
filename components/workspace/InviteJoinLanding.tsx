"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MY_BOTS_HREF, workspaceHubHref } from "@/lib/workspace-ui/nav";
import {
  INVITE_NO_LONGER_VALID_MESSAGE,
  joinApiHref,
  parseJoinResponse,
} from "@/lib/workspace-ui/join";

type JoinState =
  | { status: "joining" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export default function InviteJoinLanding({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<JoinState>({ status: "joining" });

  useEffect(() => {
    if (!token) {
      setState({
        status: "invalid",
        message: INVITE_NO_LONGER_VALID_MESSAGE,
      });
      return;
    }

    let cancelled = false;

    async function join() {
      try {
        const res = await fetch(joinApiHref(token), { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        const parsed = parseJoinResponse(res.status, body);
        if (!parsed.ok) {
          const isInvalid =
            res.status === 410 ||
            res.status === 404 ||
            parsed.error.toLowerCase().includes("no longer valid") ||
            parsed.error.toLowerCase().includes("not found");
          setState({
            status: isInvalid ? "invalid" : "error",
            message: isInvalid
              ? parsed.error.toLowerCase().includes("no longer valid")
                ? parsed.error
                : INVITE_NO_LONGER_VALID_MESSAGE
              : parsed.error,
          });
          return;
        }

        router.replace(workspaceHubHref(parsed.workspaceId));
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Failed to join workspace",
          });
        }
      }
    }

    void join();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (state.status === "joining") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-zinc-50">
          Joining Workspace…
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
          Accepting your invite link.
        </p>
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div
        className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
        data-testid="invite-no-longer-valid"
      >
        <h1 className="text-xl font-semibold text-amber-950 dark:text-amber-100">
          Invite no longer valid
        </h1>
        <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-100/90">
          {state.message}
        </p>
        <p className="mt-4 text-sm text-amber-900/80 dark:text-amber-100/80">
          This invite link may have been revoked or expired. Ask the Workspace
          owner or facilitator for a new link.
        </p>
        <Link
          href={MY_BOTS_HREF}
          className="mt-6 inline-block text-sm font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
        >
          Back to My bots
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/80 p-8 shadow-sm dark:border-red-900/50 dark:bg-red-950/30">
      <h1 className="text-xl font-semibold text-red-900 dark:text-red-100">
        Could not join
      </h1>
      <p className="mt-2 text-sm text-red-800 dark:text-red-200">
        {state.message}
      </p>
      <Link
        href={MY_BOTS_HREF}
        className="mt-6 inline-block text-sm font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
      >
        Back to My bots
      </Link>
    </div>
  );
}
