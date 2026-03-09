import { SupportedProvider } from "./types";

export type ModelOption = {
  value: string;
  label: string;
};

export const DEFAULT_VARIABILITY = 70;

export const MODEL_OPTIONS: ModelOption[] = [
  { value: "openai:gpt-4o-mini", label: "OpenAI - GPT-4o mini" },
  { value: "openai:gpt-4o", label: "OpenAI - GPT-4o" },
  {
    value: "anthropic:claude-3-5-sonnet",
    label: "Anthropic - Claude 3.5 Sonnet",
  },
  { value: "google:gemini-1.5-pro", label: "Google - Gemini 1.5 Pro" },
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
