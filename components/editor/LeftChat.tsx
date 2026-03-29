"use client";

import { useEffect, useRef, useState } from "react";
import { readStoredPrompt } from "@/lib/prompt-storage/client";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function getHintFactorySystemPrompt(appId?: string) {
  const draft =
    typeof window !== "undefined"
      ? readStoredPrompt(appId)
      : "";

  return [
    "You are the Pedagogical Agent Builder.",
    "Help the user improve prompts, iterate on app behavior, and think through better instructional scaffolds.",
    "Be concise, practical, and collaborative.",
    "When useful, propose concrete wording edits or next-step experiments.",
    draft.trim()
      ? `The user's current draft prompt/instruction document is below. Use it as context when giving advice:\n\n${draft}`
      : "If the user has not shared enough context, ask a short clarifying question before suggesting major changes.",
  ].join("\n\n");
}

export default function LeftChat({
  appId,
  appVersion,
}: {
  appId: string;
  appVersion?: number;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [modelLabel, setModelLabel] = useState("Loading model...");
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Initialize welcome message
   */
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content:
          "Welcome to the Pedagogical Agent Builder. I'm here to help you develop ideas or iterate on your prompts.\n\nWould you consider yourself a beginner, intermediate, or advanced user?",
      },
    ]);
  }, [appId]);

  /**
   * Scroll chat
   */
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  /**
   * Load model/provider info
   */
  useEffect(() => {
    async function loadApp() {
      try {
        const res = await fetch(`/api/apps/${appId}`);
        const body = await res.json();

        if (res.ok && body?.app) {
          setModelLabel(`${body.app.provider} · ${body.app.model}`);
        }
      } catch {
        setModelLabel("Unknown model");
      }
    }

    void loadApp();
  }, [appId, appVersion]);

  /**
   * Send message
   */
  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const nextMessages = [
      ...messages,
      { role: "user", content: text } as ChatMessage,
    ];

    setInput("");
    setMessages(nextMessages);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appId,
          system: getHintFactorySystemPrompt(appId),
          messages: nextMessages,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json");
      const body = isJSON ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = isJSON
          ? body?.error || body?.message || "Server error"
          : String(body).slice(0, 400);

        throw new Error(msg);
      }

      const reply = isJSON ? body?.reply ?? "" : String(body);

      setMessages((m) => [
        ...m,
        { role: "assistant", content: reply },
      ]);

      /**
       * Update model label if returned
       */
      if (isJSON && body?.provider && body?.model) {
        setModelLabel(`${body.provider} · ${body.model}`);
      }
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Sorry—something went wrong: ${e?.message || e}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Enter key send
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-slate-200 bg-sky-50/70 px-6 py-4 dark:border-zinc-700 dark:bg-sky-950/40">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-sky-700 dark:bg-sky-900/60 dark:text-sky-200">
            Assistant Bot
          </span>
          <span className="text-xs text-slate-500 dark:text-zinc-400">{modelLabel}</span>
        </div>
        <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-zinc-100">
          Pedagogical Agent Builder
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
          Ask for prompt feedback, iteration ideas, and follow-up questions about
          your app design.
        </p>
        <div className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
          Session {new Date().toLocaleDateString()}
        </div>
      </div>
      

      {/* Messages */}
      <div
        ref={listRef}
        className="mt-4 px-6 flex-1 overflow-auto space-y-4"
      >
        {messages.map((m, i) => (
          <div key={i}>
            <div className="mb-1 text-xs text-slate-400 dark:text-zinc-500">
              {m.role === "user" ? "You" : "Pedagogical Agent Builder"}
            </div>

            <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="text-sm text-slate-500 dark:text-zinc-400">
            Thinking…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 px-6 pb-6 pt-4 dark:border-zinc-700">
        <div className="flex gap-2">
          <input
            className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 placeholder:text-slate-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            placeholder="Ask the assistant to critique or improve your prompt"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />

          <button
            onClick={send}
            disabled={busy}
            className="h-11 px-4 rounded-lg bg-sky-600 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
          This bot helps you iterate on the prompt and can ask you clarifying
          questions.
        </p>
      </div>
    </section>
  );
}