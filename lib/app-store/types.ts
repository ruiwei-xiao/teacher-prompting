export type SupportedProvider = "openai" | "google" | "anthropic";

export type AppConfig = {
  id: string;
  publicSlug?: string;
  ownerId?: string;
  name: string;
  description?: string;
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  variability?: number;
  systemPrompt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};