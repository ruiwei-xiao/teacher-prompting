import ChatMessageBody from "@/components/chat/ChatMessageBody";
import type { ChatSessionRecord } from "@/lib/chat-session-store/types";
import { transcriptParticipantLabel } from "./session-display";

export default function SessionTranscript({
  session,
}: {
  session: ChatSessionRecord;
}) {
  const speakerForUser = transcriptParticipantLabel(session.participantName);

  return (
    <div className="space-y-4">
      {session.messages.map((message, index) => {
        const fromUser = message.role === "user";
        const imageNote = message.imageOmitted ? "(image attached)" : null;
        return (
          <div
            key={`${message.at}-${index}`}
            className={[
              "flex flex-col",
              fromUser ? "items-end" : "items-start",
            ].join(" ")}
          >
            <div className="mb-1 px-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
              {fromUser ? speakerForUser : session.appName}
            </div>
            <div
              className={[
                "max-w-[85%] space-y-2 rounded-[1.5rem] border-2 px-4 py-3 text-[15px] leading-7 shadow-sm",
                fromUser
                  ? "border-sky-200 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                  : "border-rose-200 bg-white text-slate-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100",
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
  );
}
