"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function Icon({
  d,
  className = "w-4 h-4",
}: {
  d: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function getAssistantSystemPrompt() {
  if (typeof window !== "undefined") {
    const fromEditor = localStorage.getItem("instruction-doc-md") || "";
    if (fromEditor.trim()) return fromEditor;
  }

  return `I’m a python beginner having trouble with debugging.
The coding problem, my code, and output are as follows:[problem description]
[current code]
[current output]

Can you act as an intro-level programming tutor and generate a minimal-code example of a different problem that uses a for loop to iterate over indices?

Don’t give me the solution to the problem.`;
}

function getInitialMessages(appName: string): ChatMessage[] {
  return [
    {
      role: "assistant",
      content: `Welcome to ${appName}! How can I help?`,
    },
  ];
}

export default function AssistantPanel({
  appId,
  appName,
  appVersion,
}: {
  appId: string;
  appName: string;
  appVersion?: number;
}) {
  const displayName = appName.trim() || appId;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getInitialMessages(displayName)
  );
  const [busy, setBusy] = useState(false);
  const [modelLabel, setModelLabel] = useState("Loading model...");
  const listRef = useRef<HTMLDivElement>(null);

  async function loadApp() {
    try {
      const res = await fetch(`/api/apps/${appId}`);
      const body = await res.json();

      if (res.ok && body?.app) {
        setModelLabel(`${body.app.provider} · ${body.app.model}`);
        return;
      }

      setModelLabel("Unknown model");
    } catch {
      setModelLabel("Unknown model");
    }
  }

  function resetSession() {
    setMessages(getInitialMessages(displayName));
    setInput("");
  }

  useEffect(() => {
    void loadApp();
  }, [appId, appVersion]);

  useEffect(() => {
    resetSession();
  }, [appId, appName, appVersion]);

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
          system: getAssistantSystemPrompt(),
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

      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);

      if (isJSON && body?.provider && body?.model) {
        setModelLabel(`${body.provider} · ${body.model}`);
      }
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

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <aside className="h-full bg-white flex flex-col">
      <div className="px-4 py-3 border-b bg-emerald-50/70 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Icon
            d="M3 12a9 9 0 1018 0A9 9 0 003 12zm10-4H8v2h5V8zm3 4H8v2h8v-2zm-3 4H8v2h5v-2z"
            className="w-5 h-5 text-slate-600"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Prompt Preview
              </span>
              <span className="text-xs text-slate-500 truncate">{modelLabel}</span>
            </div>
            <h3 className="mt-2 font-semibold truncate">{displayName}</h3>
            <div className="text-xs text-slate-500 truncate">
              Runs the current middle-editor prompt as this app's system prompt.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            className="p-1.5 rounded hover:bg-slate-100"
            title="Refresh"
            onClick={() => {
              resetSession();
              void loadApp();
            }}
          >
            <Icon d="M12 6V3L8 7l4 4V8a4 4 0 110 8 4 4 0 01-3.46-2H6.26A6 6 0 1012 6z" />
          </button>
          <button
            className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
            onClick={resetSession}
            type="button"
          >
            New session
          </button>
        </div>
      </div>

      <div className="px-4 py-3 text-sm text-slate-600 border-b">
        Test how the current prompt behaves with a real user message.
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
        <div className="text-[12px] text-slate-500">
          Preview session {new Date().toLocaleDateString()} · {displayName}
        </div>

        {messages.map((message, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className={[
                  "h-5 w-5 rounded-full",
                  message.role === "assistant" ? "bg-sky-500" : "bg-slate-300",
                ].join(" ")}
              />
              <div className="text-xs text-slate-500">
                {message.role === "assistant" ? `${displayName} preview` : "Test user"}
              </div>
            </div>

            <div className="text-slate-800 leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
          </div>
        ))}

        {busy && <div className="text-sm text-slate-500">Thinking...</div>}
      </div>

      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <button
            className="p-2 rounded-lg border border-slate-300 text-slate-400 cursor-not-allowed"
            title="Attach"
            disabled
            type="button"
          >
            <Icon
              d="M16.5 6.5l-7.8 7.8a3 3 0 11-4.24-4.24L12 2.5a5 5 0 117.07 7.07l-8.49 8.49"
              className="w-5 h-5"
            />
          </button>
          <input
            className="flex-1 h-11 rounded-lg border px-3"
            placeholder="Send a test user message to preview this prompt"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          <button
            className="h-11 px-5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
            onClick={send}
            disabled={busy}
            type="button"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          This panel previews the behavior of the current prompt, not the hint
          assistant.
        </p>
      </div>
    </aside>
  );
}
