import { SupportedProvider } from "./types";

export type ModelOption = {
  value: string;
  label: string;
};

export const DEFAULT_VARIABILITY = 70;

export const MODEL_OPTIONS: ModelOption[] = [
  { value: "openai:gpt-5.4-mini", label: "OpenAI - GPT-5.4 mini" },
  { value: "openai:gpt-5.4", label: "OpenAI - GPT-5.4" },
  {
    value: "anthropic:claude-sonnet-4-6",
    label: "Anthropic - Claude Sonnet 4.6",
  },
  {
    value: "anthropic:claude-opus-4-6",
    label: "Anthropic - Claude Opus 4.6",
  },
  { value: "google:gemini-2.5-flash", label: "Google - Gemini 2.5 Flash" },
  { value: "google:gemini-2.5-pro", label: "Google - Gemini 2.5 Pro" },
  {
    value: "google:gemini-3.1-flash-lite-preview",
    label: "Google - Gemini 3.1 Flash-Lite (preview)",
  },
  {
    value: "google:gemini-3-flash-preview",
    label: "Google - Gemini 3 Flash (preview)",
  },
  {
    value: "google:gemini-3.1-pro-preview",
    label: "Google - Gemini 3.1 Pro (preview)",
  },
];

export function parseModelSelection(modelValue: string): {
  provider: SupportedProvider;
  model: string;
} {
  if (modelValue.startsWith("openai:")) {
    return { provider: "openai", model: modelValue.replace("openai:", "") };
  }
  if (modelValue.startsWith("google:")) {
    return { provider: "google", model: modelValue.replace("google:", "") };
  }
  if (modelValue.startsWith("anthropic:")) {
    return {
      provider: "anthropic",
      model: modelValue.replace("anthropic:", ""),
    };
  }

  throw new Error(`Unsupported model selection: ${modelValue}`);
}

export function toModelSelection(provider: SupportedProvider, model: string) {
  return `${provider}:${model}`;
}

export function getModelLabel(provider: SupportedProvider, model: string) {
  const selection = toModelSelection(provider, model);
  const option = MODEL_OPTIONS.find((item) => item.value === selection);
  return option?.label ?? `${provider} - ${model}`;
}

export function clampVariability(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeVariability(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_VARIABILITY;
  }

  return clampVariability(value);
}

export function formatVariabilityLabel(value?: number | null) {
  return `${normalizeVariability(value)}% variability`;
}

export function variabilityToTemperature(value?: number | null) {
  return normalizeVariability(value) / 100;
}
