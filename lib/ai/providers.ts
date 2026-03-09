import { SupportedProvider } from "@/lib/app-store/types";
import { variabilityToTemperature } from "@/lib/app-store/model-selection";

export type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
};

type SendChatArgs = {
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  variability?: number;
  system?: string;
  messages: ChatMsg[];
};

export async function sendChat(args: SendChatArgs): Promise<string> {
  const { provider } = args;

  if (provider === "openai") {
    return sendOpenAI(args);
  }
  if (provider === "google") {
    return sendGemini(args);
  }
  if (provider === "anthropic") {
    return sendClaude(args);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function sendOpenAI({
  model,
  apiKey,
  system,
  messages,
  variability,
}: SendChatArgs): Promise<string> {
  const payload = {
    model,
    temperature: variabilityToTemperature(variability),
    messages: [
      { role: "system", content: system || "You are a helpful assistant." },
      ...messages,
    ],
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await readUpstream(r);
  if (!r.ok) throw new Error(`OpenAI error (${r.status}): ${body}`);

  return body?.choices?.[0]?.message?.content ?? "";
}

async function sendClaude({
  model,
  apiKey,
  system,
  messages,
  variability,
}: SendChatArgs): Promise<string> {
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const payload = {
    model,
    max_tokens: 1024,
    temperature: variabilityToTemperature(variability),
    system: system || "You are a helpful assistant.",
    messages: anthropicMessages,
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await readUpstream(r);
  if (!r.ok) throw new Error(`Anthropic error (${r.status}): ${body}`);

  return body?.content?.map((c: any) => c?.text || "").join("") ?? "";
}

async function sendGemini({
  model,
  apiKey,
  system,
  messages,
  variability,
}: SendChatArgs): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const payload = {
    systemInstruction: {
      parts: [{ text: system || "You are a helpful assistant." }],
    },
    generationConfig: {
      temperature: variabilityToTemperature(variability),
    },
    contents,
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await readUpstream(r);
  if (!r.ok) throw new Error(`Gemini error (${r.status}): ${body}`);

  return (
    body?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ?? ""
  );
}

async function readUpstream(r: Response): Promise<any> {
  const contentType = r.headers.get("content-type") || "";
  const isJSON = contentType.includes("application/json");
  const body = isJSON ? await r.json() : await r.text();

  if (isJSON) return body;
  return String(body).slice(0, 500);
}