import { SupportedProvider } from "@/lib/app-store/types";
import { variabilityToTemperature } from "@/lib/app-store/model-selection";

export type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  /** Data URL or HTTPS URL; OpenAI vision only in this app. */
  imageUrl?: string;
};

function toOpenAIMessagePayload(m: ChatMsg): { role: string; content: string | object[] } {
  if (m.role === "assistant" || m.role === "system") {
    return { role: m.role, content: m.content };
  }
  const url = m.imageUrl?.trim();
  if (!url) {
    return { role: "user", content: m.content };
  }
  const text = m.content.trim();
  const parts: object[] = [];
  if (text) {
    parts.push({ type: "text", text: m.content });
  }
  parts.push({ type: "image_url", image_url: { url } });
  return { role: "user", content: parts };
}

type SendChatArgs = {
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  variability?: number;
  system?: string;
  messages: ChatMsg[];
};

const OPENAI_IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description:
      "Generate an educational illustration or simple diagram when the learner asks to see a picture, visualization, or sketch, or when a clear visual would materially help understanding. Do not call for every reply—only when visuals are requested or clearly valuable. Keep prompts safe and classroom-appropriate.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed, concrete description of the image in English (style, subject, labels if needed). Avoid copyrighted characters.",
        },
      },
      required: ["prompt"],
    },
  },
};

function openaiModelSupportsImageTool(model: string): boolean {
  const m = model.toLowerCase();
  if (m.startsWith("o1") || m.startsWith("o2") || m.startsWith("o3")) return false;
  return m.includes("gpt");
}

async function generateOpenAIIllustrationImage(apiKey: string, prompt: string): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1.5",
      prompt: prompt.slice(0, 4000),
      n: 1,
      size: "1024x1024",
      quality: "medium",
      response_format: "b64_json",
    }),
  });
  const body = await readUpstream(r);
  if (!r.ok) {
    const msg = body?.error?.message || JSON.stringify(body).slice(0, 400);
    throw new Error(msg);
  }
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") throw new Error("No image data in response");
  return `data:image/png;base64,${b64}`;
}

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

async function sendOpenAI(args: SendChatArgs): Promise<string> {
  if (!openaiModelSupportsImageTool(args.model)) {
    return sendOpenAITextOnly(args);
  }
  try {
    return await sendOpenAIWithImageToolLoop(args);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/tool|tools|invalid_request|not support|Unsupported/i.test(msg)) {
      return sendOpenAITextOnly(args);
    }
    throw e;
  }
}

async function sendOpenAITextOnly({
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
      ...messages.map(toOpenAIMessagePayload),
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
  if (!r.ok) throw new Error(`OpenAI error (${r.status}): ${JSON.stringify(body).slice(0, 500)}`);

  return body?.choices?.[0]?.message?.content ?? "";
}

async function sendOpenAIWithImageToolLoop(args: SendChatArgs): Promise<string> {
  const { model, apiKey, system, messages, variability } = args;

  const conversation: Record<string, unknown>[] = [
    { role: "system", content: system || "You are a helpful assistant." },
    ...messages.map((m) => toOpenAIMessagePayload(m)),
  ];

  const maxSteps = 6;
  for (let step = 0; step < maxSteps; step++) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: variabilityToTemperature(variability),
        messages: conversation,
        tools: [OPENAI_IMAGE_TOOL],
        tool_choice: "auto",
        max_tokens: 4096,
      }),
    });

    const body = await readUpstream(r);
    if (!r.ok) {
      throw new Error(`OpenAI error (${r.status}): ${JSON.stringify(body).slice(0, 500)}`);
    }

    const choice = body?.choices?.[0];
    const msg = choice?.message;
    const finish = choice?.finish_reason;

    if (finish === "tool_calls" && Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0) {
      conversation.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        const name = tc?.function?.name;
        const id = tc?.id;
        if (name === "generate_image" && id) {
          let parsed: { prompt?: string } = {};
          try {
            parsed = JSON.parse(tc.function?.arguments || "{}");
          } catch {
            parsed = {};
          }
          const imagePrompt = String(parsed.prompt || "").trim();
          let toolContent: string;
          if (!imagePrompt) {
            toolContent = "Missing prompt; ask the learner what to illustrate.";
          } else {
            try {
              const imageUrl = await generateOpenAIIllustrationImage(apiKey, imagePrompt);
              toolContent = `Success. Show the learner this markdown on its own line: ![illustration](${imageUrl})`;
            } catch (err: unknown) {
              const em = err instanceof Error ? err.message : String(err);
              toolContent = `Image generation failed: ${em}. Briefly apologize and describe verbally instead.`;
            }
          }
          conversation.push({
            role: "tool",
            tool_call_id: id,
            content: toolContent,
          });
        } else if (id) {
          conversation.push({
            role: "tool",
            tool_call_id: id,
            content: "Unsupported tool.",
          });
        }
      }
      continue;
    }

    const text = typeof msg?.content === "string" ? msg.content : "";
    return text;
  }

  throw new Error("OpenAI tool loop exceeded step limit");
}

async function sendClaude({
  model,
  apiKey,
  system,
  messages,
  variability,
}: SendChatArgs): Promise<string> {
  if (messages.some((m) => m.imageUrl?.trim())) {
    throw new Error(
      "Image attachments are only supported for OpenAI models (e.g. GPT-5.4 mini) in this app."
    );
  }
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

  return body?.content?.map((c: { text?: string }) => c?.text || "").join("") ?? "";
}

async function sendGemini({
  model,
  apiKey,
  system,
  messages,
  variability,
}: SendChatArgs): Promise<string> {
  if (messages.some((m) => m.imageUrl?.trim())) {
    throw new Error(
      "Image attachments are only supported for OpenAI models (e.g. GPT-5.4 mini) in this app."
    );
  }
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
    body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text || "").join("") ?? ""
  );
}

async function readUpstream(r: Response): Promise<any> {
  const contentType = r.headers.get("content-type") || "";
  const isJSON = contentType.includes("application/json");
  const body = isJSON ? await r.json() : await r.text();

  if (isJSON) return body;
  return String(body).slice(0, 500);
}
