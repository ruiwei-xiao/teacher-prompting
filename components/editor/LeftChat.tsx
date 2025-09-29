// components/editors/LeftChat.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

function getDefaultSystemPrompt() {
  if (typeof window !== "undefined") {
    const fromEditor = localStorage.getItem("instruction-doc-md") || "";
    if (fromEditor.trim()) return fromEditor;
  }
  return `I’m a python beginner having trouble with debugging.
The coding problem, my code, and output are as follows:[problem description]
[current code]
[current output]Can you act as am intro-level programming tutor and
generate a minimal-code example of a different problem that
uses a for loop to iterate over indices? Don’t give me the
solution to the problem.`;
}

export default function LeftChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Welcome to PEDAGOGICAL-PROMPTING! How can I help?" },
  ]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: getDefaultSystemPrompt(),
          messages: [...messages, { role: "user", content: text }],
        }),
      });

      // 🔒 Read the body ONCE based on content-type
      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json");
      const body = isJSON ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = isJSON
          ? (body?.error || body?.message || "Server error")
          : String(body).slice(0, 400);
        throw new Error(msg);
      }

      const reply = isJSON ? (body?.reply ?? "") : String(body);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Sorry—something went wrong: ${e?.message || e}` },
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
    <section className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 text-sm text-slate-500">
        Session {new Date().toLocaleDateString()} · Claude 4 Sonnet
      </div>

      {/* Messages */}
      <div ref={listRef} className="mt-4 px-6 flex-1 overflow-auto space-y-4">
        {messages.map((m, i) => (
          <div key={i}>
            <div className="text-xs mb-1 text-slate-400">
              {m.role === "user" ? "You" : "Assistant"}
            </div>
            <div className="rounded-xl border bg-white px-3 py-2 whitespace-pre-wrap">
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-slate-500 text-sm">Thinking…</div>}
      </div>

      {/* Composer */}
      <div className="px-6 pb-6 pt-4 border-t">
        <div className="flex gap-2">
          <input
            className="flex-1 h-11 rounded-lg border px-3"
            placeholder="Enter Message"
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
        <p className="mt-2 text-xs text-slate-500">
          AI can make mistakes, including bias. Check important information.
        </p>
      </div>
    </section>
  );
}
