"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectVisualizationMode,
  getVisualizationTitle,
  type VisualizationState,
  VisualizationSurface,
} from "@/components/editor/AssistantPanel";
import {
  buildFileAttachmentText,
  getSpeechRecognitionConstructor,
  TEXT_FILE_INPUT_ACCEPT,
} from "@/lib/chat-input/client";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function getWelcomeMessage(appName: string) {
  return `Hi! I'm ${appName}. We can learn step by step together.\n\nYou can type, speak, or attach a file to get started.`;
}

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
      content: getWelcomeMessage(appName),
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [attachedFileName, setAttachedFileName] = useState("");
  const [attachedFileText, setAttachedFileText] = useState("");
  const [visualFullscreen, setVisualFullscreen] = useState(false);
  const [visualizationState, setVisualizationState] =
    useState<VisualizationState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const visualizationMode = useMemo(
    () => detectVisualizationMode(systemPrompt || ""),
    [systemPrompt]
  );
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  const assistantTurnCount = messages.filter((message) => message.role === "assistant").length;

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  async function send(textOverride?: string) {
    const baseText = (textOverride ?? input).trim();
    const text = attachedFileText
      ? [baseText, attachedFileText].filter(Boolean).join("\n\n")
      : baseText;
    if (!text || busy) return;

    const nextMessages = [
      ...messages,
      { role: "user", content: text } as ChatMessage,
    ];

    setMessages(nextMessages);
    setComposerError("");
    setInput("");
    setAttachedFileName("");
    setAttachedFileText("");
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

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setComposerError("");
      setListening(true);
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || "")
        .join(" ");
      setInput(transcript.trim());
    };
    recognition.onerror = () => {
      setComposerError("Voice input failed. Please try again.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const attachmentText = await buildFileAttachmentText(file);
      setAttachedFileName(file.name);
      setAttachedFileText(attachmentText);
      setComposerError("");
    } catch (error: any) {
      setComposerError(error?.message || "Could not read that file.");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col bg-gradient-to-b from-amber-50 via-rose-50/60 to-sky-50 px-4 py-8">
      <div className="overflow-hidden rounded-[2rem] border-2 border-rose-100 bg-white/90 shadow-[0_16px_48px_rgba(251,113,133,0.12)] backdrop-blur-sm">
        <div className="border-b border-rose-100 bg-gradient-to-r from-amber-100 via-rose-100 to-sky-100 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Published chatbot
            </div>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-rose-500">
              friendly mode
            </span>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-amber-600">
              learn together
            </span>
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
          className="flex h-[65vh] flex-col gap-4 overflow-auto bg-gradient-to-b from-white via-rose-50/30 to-sky-50/40 px-6 py-5"
        >
          {visualizationMode && visualizationMode !== "spacing-testing" && (
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
                    {getVisualizationTitle(visualizationMode, visualFullscreen)}
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
                  assistantTurnCount={assistantTurnCount}
                  onStateChange={setVisualizationState}
                />
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={[
                "flex flex-col",
                message.role === "user" ? "items-end" : "items-start",
              ].join(" ")}
            >
              <div className="mb-1 px-2 text-xs font-medium text-slate-500">
                {message.role === "user" ? "You" : `${appName} buddy`}
              </div>
              <div className="flex items-end gap-2">
                {message.role === "assistant" && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-100 text-sm">
                    🤖
                  </div>
                )}
                <div
                  className={[
                    "max-w-[85%] whitespace-pre-wrap rounded-[1.5rem] border-2 px-4 py-3 text-[15px] leading-7 shadow-sm",
                    message.role === "user"
                      ? "border-sky-200 bg-sky-100/90 text-sky-950"
                      : "border-rose-200 bg-white text-slate-800",
                  ].join(" ")}
                >
                  {message.content}
                </div>
                {message.role === "user" && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-sky-200 bg-sky-100 text-sm">
                    🙂 
                  </div>
                )}
              </div>
            </div>
          ))}

          {visualizationMode === "spacing-testing" && (
            <div className="flex flex-col items-start">
              <div className="mb-1 px-2 text-xs font-medium text-slate-500">
                {appName} buddy
              </div>
              <div className="flex items-end gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-100 text-sm">
                  🤖
                </div>
                <VisualizationSurface
                  mode={visualizationMode}
                  latestUserMessage={latestUserMessage}
                  assistantTurnCount={assistantTurnCount}
                  embedded={true}
                  onStateChange={setVisualizationState}
                />
              </div>
            </div>
          )}

          {busy && (
            <div className="w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
              Thinking...
            </div>
          )}
        </div>

        <div className="border-t border-rose-100 bg-white/80 px-6 py-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="h-11 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 text-sm font-medium text-slate-700 hover:bg-amber-100 disabled:opacity-50"
              title="Upload a file"
              aria-label="Upload a file"
            >
              <span aria-hidden="true">📃</span>
            </button>
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={busy}
              className={[
                "h-11 w-11 rounded-2xl border-2 text-slate-700 disabled:opacity-50",
                listening
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-violet-200 bg-violet-50 hover:bg-violet-100",
              ].join(" ")}
              title={listening ? "Stop voice input" : "Start voice input"}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
            >
              <span aria-hidden="true">🎙️</span>
            </button>
            <input
              className="h-11 flex-1 rounded-2xl border-2 border-rose-200 bg-white px-4 text-slate-800 placeholder:text-slate-400"
              placeholder={
                listening ? "Listening..." : "Type a message, use voice, or upload a file"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              className="h-11 rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-5 font-medium text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={TEXT_FILE_INPUT_ACCEPT}
            onChange={handleFileChange}
          />
          {attachedFileName && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1">
                Attached: {attachedFileName}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAttachedFileName("");
                  setAttachedFileText("");
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                Remove
              </button>
            </div>
          )}
          {composerError && (
            <p className="mt-2 text-xs text-red-600">{composerError}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Students can type, use voice input, or upload a text-based file.
          </p>
        </div>
      </div>

      {visualizationMode && visualizationMode !== "spacing-testing" && visualFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/45"
          onClick={() => setVisualFullscreen(false)}
        />
      )}
    </div>
  );
}
