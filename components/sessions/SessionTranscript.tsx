import ChatMessageBody from "@/components/chat/ChatMessageBody";
import type { ChatSessionRecord } from "@/lib/chat-session-store/types";
import {
  formatSessionStartTime,
  sessionBadgeClassName,
  sessionDisplayName,
  sessionSurfaceBadge,
  transcriptParticipantLabel,
  type SessionNameMode,
} from "./session-display";

export default function SessionTranscript({
  session,
  nameMode,
}: {
  session: ChatSessionRecord;
  nameMode: SessionNameMode;
}) {
  const speakerForUser = transcriptParticipantLabel(session.participantName);
  const heading = sessionDisplayName(session, nameMode);
  const surfaceBadge = sessionSurfaceBadge(session.surface);

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
          {heading}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
          {formatSessionStartTime(session.createdAt)}
          <span className={sessionBadgeClassName(surfaceBadge)}>
            {surfaceBadge}
          </span>
        </p>
      </header>
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {session.messages.map((message, index) => {
          const fromUser = message.role === "user";
          const previous = index > 0 ? session.messages[index - 1] : null;
          const showName = !previous || previous.role !== message.role;
          const imageNote = message.imageOmitted ? "(image attached)" : null;
          return (
            <div
              key={`${message.at}-${index}`}
              className={[
                "flex flex-col",
                fromUser ? "items-end" : "items-start",
              ].join(" ")}
            >
              {showName ? (
                <div className="mb-1 px-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
                  {fromUser ? speakerForUser : session.appName}
                </div>
              ) : null}
              <div
                className={[
                  "max-w-[min(42rem,90%)] space-y-2 rounded-2xl border px-3.5 py-2.5 text-[15px] leading-6",
                  fromUser
                    ? "border-sky-200 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                    : "border-rose-200 bg-white text-slate-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
                ].join(" ")}
              >
                {imageNote ? (
                  <p className="text-sm text-slate-500 dark:text-zinc-400">
                    {imageNote}
                  </p>
                ) : null}
                {message.content ? (
                  <ChatMessageBody content={message.content} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
