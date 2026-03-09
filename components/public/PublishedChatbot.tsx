"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectVisualizationMode,
  type VisualizationState,
  VisualizationSurface,
} from "@/components/editor/AssistantPanel";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function PublishedChatbot({
  appId,
  appName,
  systemPrompt,
}: {
  appId: string;
  appName: string;
  systemPrompt: string;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Welcome to ${appName}! How can I help?`,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [visualFullscreen, setVisualFullscreen] = useState(false);
  const [visualizationState, setVisualizationState] =
    useState<VisualizationState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const visualizationMode = useMemo(
    () => detectVisualizationMode(systemPrompt || ""),
    [systemPrompt]
  );
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;

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
          visualizationState,
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
          {visualizationMode && (
            <div
              className={[
                "border border-slate-200 bg-white shadow-sm",
                visualFullscreen
                  ? "fixed inset-4 z-50 flex flex-col overflow-hidden rounded-3xl"
                  : "rounded-2xl",
              ].join(" ")}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {visualFullscreen ? "Fullscreen visualization" : "Visualized element"}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {visualizationMode === "code-tracing"
                      ? visualFullscreen
                        ? "Code tracing visualizer"
                        : "Embedded code trace view"
                      : visualFullscreen
                        ? "Virtual lab visualizer"
                        : "Embedded virtual lab view"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVisualFullscreen((current) => !current)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {visualFullscreen ? "Close" : "Fullscreen"}
                </button>
              </div>
              <div className={visualFullscreen ? "flex-1 overflow-auto bg-slate-50 p-6" : "p-4"}>
                <VisualizationSurface
                  mode={visualizationMode}
                  latestUserMessage={latestUserMessage}
                  onStateChange={setVisualizationState}
                />
              </div>
            </div>
          )}

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

      {visualizationMode && visualFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/45"
          onClick={() => setVisualFullscreen(false)}
        />
      )}
    </div>
  );
}
