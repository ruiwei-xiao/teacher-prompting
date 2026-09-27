import type { PromptBuilderState } from "../app-store/types";

export type ConfigSnapshot = {
  name: string;
  provider: string;
  model: string;
  variability: number | null;
  systemPrompt: string;
  assistedAuthoringMode: boolean;
  builderState: PromptBuilderState | null;
};

export type VersionWriteDecision =
  | { action: "insert" }
  | { action: "update"; versionId: string };

export type ConfigFieldDiff = {
  field: string;
  earlier: string;
  later: string;
};
