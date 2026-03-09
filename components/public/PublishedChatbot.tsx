"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function PublishedChatbot({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Welcome to ${appName}! How can I help?`,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const nextMessages = [
      ...messages,
      { role: "user", content: text } as ChatMessage,
    ];

    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          messages: nextMessages,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to send message");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: body?.reply ?? "" },
      ]);
    } catch (e: any) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Sorry—something went wrong: ${e?.message || e}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-6 py-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Published chatbot
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {appName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            This chatbot is powered by the published version of the app&apos;s
            system prompt.
          </p>
        </div>

        <div
          ref={listRef}
          className="flex h-[65vh] flex-col gap-4 overflow-auto px-6 py-5"
        >
          {messages.map((message, index) => (
            <div key={index}>
              <div className="mb-1 text-xs text-slate-400">
                {message.role === "user" ? "You" : appName}
              </div>
              <div className="rounded-2xl border bg-white px-4 py-3 whitespace-pre-wrap">
                {message.content}
              </div>
            </div>
          ))}

          {busy && <div className="text-sm text-slate-500">Thinking...</div>}
        </div>

        <div className="border-t px-6 py-5">
          <div className="flex gap-2">
            <input
              className="h-11 flex-1 rounded-xl border px-3"
              placeholder="Type a message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
            />
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="h-11 rounded-xl bg-sky-600 px-5 text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            AI can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
