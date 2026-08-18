"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BadgeCheck, ClipboardList, Megaphone, Send } from "lucide-react";
import { labelForUserId } from "@/lib/auth/user-label";
import {
  OPEN_FINAL_LABEL,
  shouldOfferDeliverable,
} from "@/lib/calibration-ui/deliverable";
import { OPEN_SCORE_LABEL, shouldOfferScoreSheet } from "@/lib/calibration-ui/scores";
import { lucideSm } from "./lucide";
import {
  canCompose,
  currentRoundRoleLabel,
  isFacilitatorMessage,
  labeledMessageBody,
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
  const who = isYou
    ? "You"
    : labelForUserId(message.authorUserId ?? "", space.labels);
  return role ? `${who} · ${role}` : who;
}

function personInitial(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (
    parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)
  ).toUpperCase();
}

function FacilitatorMark() {
  return <Megaphone {...lucideSm} />;
}

function PersonAvatar({
  src,
  label,
  you = false,
  facilitator = false,
}: {
  src?: string;
  label: string;
  you?: boolean;
  facilitator?: boolean;
}) {
  const ring = facilitator
    ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200"
    : you
      ? "border-sky-200 bg-sky-100 text-sky-800"
      : "border-slate-200 bg-slate-100 text-slate-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
  if (facilitator) {
    return (
      <div
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
          ring,
        ].join(" ")}
        title="Facilitator"
      >
        <FacilitatorMark />
      </div>
    );
  }
  if (src) {
    return (
      // Google profile photos block hotlinking without no-referrer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={[
          "h-8 w-8 shrink-0 rounded-full border-2 object-cover",
          you ? "border-sky-200" : "border-slate-200 dark:border-zinc-600",
        ].join(" ")}
      />
    );
  }
  return (
    <div
      className={[
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
        ring,
      ].join(" ")}
    >
      {personInitial(label)}
    </div>
  );
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

export default function GroupChatPanel({
  teamId,
  viewerUserId,
  space,
  onPosted,
  onOpenScores,
  onOpenDeliverable,
}: {
  teamId: string;
  viewerUserId: string;
  space: SpaceView;
  onPosted: (next: SpaceView) => void;
  onOpenScores?: () => void;
  onOpenDeliverable?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(true);
  const compose = canCompose(space);
  const lastMessage = space.messages[space.messages.length - 1];

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (!forceScrollRef.current && !stickToBottomRef.current) return;
    forceScrollRef.current = false;
    stickToBottomRef.current = true;
    list.scrollTop = list.scrollHeight;
  }, [space.messages.length, lastMessage?.id]);

  async function handleSend() {
    if (!compose || busy) return;
    const payload = messagePostBody(draft);
    if (!payload.body) return;
    setError("");
    setBusy(true);
    forceScrollRef.current = true;
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

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void handleSend();
  }

  return (
    <section
      aria-label="Group chat"
      className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950"
    >
      <header className="shrink-0 border-b border-slate-200/80 px-4 py-3 dark:border-zinc-800">
        <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Group chat
        </p>
        <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-zinc-100">
          Team and facilitator
        </h2>
      </header>

      <ol
        ref={listRef}
        aria-live="polite"
        onScroll={() => {
          const list = listRef.current;
          if (list) stickToBottomRef.current = isNearBottom(list);
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-white via-slate-50/60 to-sky-50/30 px-4 py-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950"
      >
        {space.messages.length === 0 ? (
          <li className="text-sm text-slate-500 dark:text-zinc-400">
            No messages yet.
          </li>
        ) : (
          space.messages.map((message) => {
            const facilitator = isFacilitatorMessage(message);
            const isYou = message.authorUserId === viewerUserId;
            const avatarName = facilitator
              ? "Facilitator"
              : labelForUserId(message.authorUserId ?? "", space.labels);
            const avatarSrc = message.authorUserId
              ? space.avatars?.[message.authorUserId]
              : undefined;
            return (
              <li
                key={message.id}
                className={isYou && !facilitator ? "ml-8" : "mr-8"}
              >
                <div
                  className={[
                    "flex items-center gap-3",
                    isYou && !facilitator ? "justify-end" : "",
                  ].join(" ")}
                >
                  {!(isYou && !facilitator) ? (
                    <PersonAvatar
                      src={avatarSrc}
                      label={avatarName}
                      facilitator={facilitator}
                    />
                  ) : null}
                  <p
                    className={
                      facilitator
                        ? "text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"
                        : "text-xs font-medium text-slate-500 dark:text-zinc-400"
                    }
                  >
                    {authorLabel(message, space, viewerUserId)}
                  </p>
                  {isYou && !facilitator ? (
                    <PersonAvatar src={avatarSrc} label={avatarName} you />
                  ) : null}
                </div>
                <article
                  className={[
                    "mt-2 rounded-[1.4rem] border-2 px-4 py-3 text-sm leading-6 shadow-sm",
                    facilitator
                      ? "border-amber-200 bg-amber-50 text-slate-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50"
                      : isYou
                        ? "border-sky-200 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100"
                        : "border-slate-200 bg-white text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap">
                    {labeledMessageBody(message.body, space.labels)}
                  </p>
                  {onOpenScores &&
                  shouldOfferScoreSheet(message, space.messages) ? (
                    <button
                      type="button"
                      onClick={onOpenScores}
                      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-sky-700 active:scale-[0.97]"
                    >
                      <ClipboardList {...lucideSm} />
                      {OPEN_SCORE_LABEL}
                    </button>
                  ) : null}
                  {onOpenDeliverable && shouldOfferDeliverable(message) ? (
                    <button
                      type="button"
                      onClick={onOpenDeliverable}
                      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-sky-700 active:scale-[0.97]"
                    >
                      <BadgeCheck {...lucideSm} />
                      {OPEN_FINAL_LABEL}
                    </button>
                  ) : null}
                </article>
              </li>
            );
          })
        )}
      </ol>

      <div className="shrink-0 border-t border-slate-200/80 bg-white/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
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
              onKeyDown={onComposerKeyDown}
              rows={2}
              placeholder="Message"
              disabled={busy}
              className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500/30 transition-[box-shadow] duration-150 ease-out focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <div className="flex items-center justify-end gap-2">
              {error ? (
                <p className="mr-auto text-xs text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : (
                <p className="mr-auto text-[11px] text-slate-400 dark:text-zinc-500">
                  Enter to send · Shift+Enter for a new line
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-sky-700 active:scale-[0.97] disabled:opacity-50"
              >
                {busy ? (
                  "Sending…"
                ) : (
                  <>
                    <Send {...lucideSm} />
                    Send
                  </>
                )}
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
