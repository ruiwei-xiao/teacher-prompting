"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Mic, Paperclip, Send, User } from "lucide-react";
import ChatMessageBody from "@/components/chat/ChatMessageBody";
import { lucideSm } from "./lucide";
import {
  buildFileAttachmentText,
  CHAT_ATTACHMENT_ACCEPT,
  getSpeechRecognitionConstructor,
  readImageDataUrl,
} from "@/lib/chat-input/client";
import { getWelcomeMessage } from "@/lib/chat/welcome-message";
import { sampleChatApiHref } from "@/lib/calibration-ui/sample-chat";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
};

export default function ActivityBotPane({
  teamId,
  appId,
  appName,
  modelLabel,
}: {
  teamId: string;
  appId: string;
  appName: string;
  modelLabel: string;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: getWelcomeMessage(appName) },
  ]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [attachedFileName, setAttachedFileName] = useState("");
  const [attachedFileText, setAttachedFileText] = useState("");
  const [attachedImageName, setAttachedImageName] = useState("");
  const [attachedImageUrl, setAttachedImageUrl] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop?: () => void } | null>(null);
  const shortModel = modelLabel.includes(" - ")
    ? modelLabel.split(" - ").slice(1).join(" - ")
    : modelLabel;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  function clearConversation() {
    recognitionRef.current?.stop?.();
    setListening(false);
    setMessages([{ role: "assistant", content: getWelcomeMessage(appName) }]);
    setInput("");
    setComposerError("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
  }

  async function send() {
    const baseText = input.trim();
    const text =
      attachedFileText && !attachedImageUrl
        ? [baseText, attachedFileText].filter(Boolean).join("\n\n")
        : baseText;
    const userContent =
      text.trim() || (attachedImageUrl ? "(See attached image.)" : "");
    if ((!userContent.trim() && !attachedImageUrl) || busy || !appId || !teamId) {
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: userContent,
      ...(attachedImageUrl ? { imageUrl: attachedImageUrl } : {}),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setComposerError("");
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
    setAttachedImageName("");
    setAttachedImageUrl("");
    setBusy(true);

    try {
      const res = await fetch(sampleChatApiHref(teamId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to send message");
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: body?.reply ?? "" },
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send";
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `Sorry—something went wrong: ${message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void send();
  }

  function toggleVoiceInput() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setComposerError("Voice input is not supported in this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    const recognition = new Recognition() as any;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setInput((current) => `${current} ${transcript}`.trim());
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await readImageDataUrl(file);
        setAttachedImageName(file.name);
        setAttachedImageUrl(dataUrl);
        setAttachedFileName("");
        setAttachedFileText("");
      } else {
        const attachmentText = await buildFileAttachmentText(file);
        setAttachedFileName(file.name);
        setAttachedFileText(attachmentText);
        setAttachedImageName("");
        setAttachedImageUrl("");
      }
      setComposerError("");
    } catch (error: unknown) {
      setComposerError(
        error instanceof Error ? error.message : "Could not read that file."
      );
    }
  }

  return (
    <aside
      aria-label="Try the sample bot"
      className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950"
    >
      <header className="shrink-0 border-b border-slate-200/80 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-400">
              Try the sample bot
            </p>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
              {appName}
              {shortModel ? (
                <span className="font-medium text-slate-500 dark:text-zinc-400">
                  {" "}
                  · {shortModel}
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={clearConversation}
            disabled={busy}
            className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-[transform,background-color] duration-150 ease-out hover:bg-slate-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-white via-rose-50/30 to-sky-50/40 px-4 py-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950"
      >
        {messages.map((message, index) => {
          const fromYou = message.role === "user";
          return (
            <div
              key={`${message.role}-${index}`}
              className={fromYou ? "ml-8" : "mr-8"}
            >
              <div
                className={[
                  "flex items-center gap-3",
                  fromYou ? "justify-end" : "",
                ].join(" ")}
              >
                {!fromYou ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200">
                    <Bot {...lucideSm} />
                  </div>
                ) : null}
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                  {fromYou ? "You" : appName}
                </p>
                {fromYou ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-sky-200 bg-sky-100 text-sky-800">
                    <User {...lucideSm} />
                  </div>
                ) : null}
              </div>
              <div
                className={[
                  "mt-2 rounded-[1.4rem] border-2 px-4 py-3 text-sm leading-6 shadow-sm",
                  fromYou
                    ? "border-sky-200 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100"
                    : "border-rose-200 bg-rose-50 text-slate-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-50",
                ].join(" ")}
              >
                {message.imageUrl ? (
                  <img
                    src={message.imageUrl}
                    alt=""
                    className="mb-2 max-h-48 rounded-xl object-contain"
                  />
                ) : null}
                <ChatMessageBody content={message.content} />
              </div>
            </div>
          );
        })}
        {busy ? (
          <div className="mr-8">
            <p className="w-fit rounded-[1.4rem] border-2 border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
              Thinking…
            </p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-slate-200/80 bg-white/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        {composerError ? (
          <p className="mb-2 text-xs text-red-600 dark:text-red-300">{composerError}</p>
        ) : null}
        <div className="space-y-2">
          <label className="sr-only" htmlFor="sample-bot-composer">
            Message the sample bot
          </label>
          <textarea
            id="sample-bot-composer"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={listening ? "Listening…" : "Message"}
            disabled={busy}
            className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-500/30 transition-[box-shadow] duration-150 ease-out focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-600 transition-[transform,background-color] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              title="Upload file or image"
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip {...lucideSm} />
            </button>
            <button
              className={[
                "inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] disabled:opacity-50",
                listening
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
              ].join(" ")}
              title={listening ? "Stop voice input" : "Start voice input"}
              type="button"
              disabled={busy}
              onClick={toggleVoiceInput}
            >
              <Mic {...lucideSm} />
            </button>
            {composerError ? null : (
              <p className="mr-auto text-[11px] text-slate-400 dark:text-zinc-500">
                Enter to send · Shift+Enter for a new line
              </p>
            )}
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-rose-700 active:scale-[0.97] disabled:opacity-50"
              onClick={() => void send()}
              disabled={busy}
              type="button"
            >
              <Send {...lucideSm} />
              Send
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={CHAT_ATTACHMENT_ACCEPT}
          onChange={(event) => void handleFileChange(event)}
        />
        {attachedFileName ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-zinc-400">
            Attached: {attachedFileName}
          </p>
        ) : null}
        {attachedImageName ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-zinc-400">
            Image: {attachedImageName}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
