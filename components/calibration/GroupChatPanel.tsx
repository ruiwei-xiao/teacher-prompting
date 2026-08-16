"use client";

import { useState } from "react";
import {
  canCompose,
  currentRoundRoleLabel,
  isFacilitatorMessage,
  messagePostBody,
  messagesApiHref,
  parsePostedMessageResponse,
  type SpaceMessage,
  type SpaceView,
} from "@/lib/calibration-ui/space";

function authorLabel(
  message: SpaceMessage,
  space: SpaceView,
  viewerUserId: string
): string {
  if (isFacilitatorMessage(message)) return "Facilitator";
  const role = message.authorUserId
    ? currentRoundRoleLabel(space, message.authorUserId)
    : null;
  const isYou = message.authorUserId === viewerUserId;
  const who = isYou ? "You" : "Learner";
  return role ? `${who} · ${role}` : who;
}

export default function GroupChatPanel({
  teamId,
  viewerUserId,
  space,
  onPosted,
}: {
  teamId: string;
  viewerUserId: string;
  space: SpaceView;
  onPosted: (next: SpaceView) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const compose = canCompose(space);

  async function handleSend() {
    if (!compose) return;
    const payload = messagePostBody(draft);
    if (!payload.body) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(messagesApiHref(teamId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parsePostedMessageResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      onPosted(parsed.space);
      setDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to post message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Group chat"
      className="flex h-full min-h-[28rem] flex-col rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80"
    >
      <header className="border-b border-slate-200/80 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
          Group chat
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
          Team messages stay here while people come and go.
        </p>
      </header>

      <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {space.messages.length === 0 ? (
          <li className="text-sm text-slate-500 dark:text-zinc-400">
            No messages yet.
          </li>
        ) : (
          space.messages.map((message) => {
            const facilitator = isFacilitatorMessage(message);
            return (
              <li key={message.id}>
                <article
                  className={
                    facilitator
                      ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/40"
                      : "rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
                  }
                >
                  <p
                    className={
                      facilitator
                        ? "text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"
                        : "text-xs font-medium text-slate-500 dark:text-zinc-400"
                    }
                  >
                    {authorLabel(message, space, viewerUserId)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-zinc-200">
                    {message.body}
                  </p>
                </article>
              </li>
            );
          })
        )}
      </ol>

      <div className="border-t border-slate-200/80 px-4 py-3 dark:border-zinc-700">
        {compose ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
            className="space-y-2"
          >
            <label className="sr-only" htmlFor="group-chat-composer">
              Write a message
            </label>
            <textarea
              id="group-chat-composer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              placeholder="Write a message"
              disabled={busy}
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <div className="flex items-center justify-end gap-2">
              {error && (
                <p className="mr-auto text-xs text-red-600 dark:text-red-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="inline-flex h-9 items-center rounded-lg bg-sky-600 px-4 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            You are viewing as the instructor. Chat is read-only.
          </p>
        )}
      </div>
    </section>
  );
}
