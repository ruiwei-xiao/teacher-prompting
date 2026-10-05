import type { AppConfig, PromptBuilderState } from "../app-store/types";
import type {
  ConfigFieldDiff,
  ConfigSnapshot,
  VersionWriteDecision,
} from "./types";

export type {
  ConfigFieldDiff,
  ConfigSnapshot,
  VersionWriteDecision,
} from "./types";

export const CONFIG_VERSION_WINDOW_MS = 15 * 60 * 1000;

function builderLeaves<const T extends readonly (keyof PromptBuilderState)[]>(
  leaves: [Exclude<keyof PromptBuilderState, T[number]>] extends [never] ? T : never
): T {
  return leaves;
}

const BUILDER_LEAVES = builderLeaves([
  "learningObjective",
  "learningObjectivePrompt",
  "uploadedExerciseName",
  "uploadedExerciseText",
  "exercisePrompt",
  "gradeLevel",
  "language",
  "learnerNotes",
  "learnerProfilePrompt",
  "selectedTemplate",
  "templatePrompt",
]);

function copyBuilderState(state: PromptBuilderState): PromptBuilderState {
  return {
    learningObjective: state.learningObjective,
    learningObjectivePrompt: state.learningObjectivePrompt,
    uploadedExerciseName: state.uploadedExerciseName,
    uploadedExerciseText: state.uploadedExerciseText,
    exercisePrompt: state.exercisePrompt,
    gradeLevel: state.gradeLevel,
    language: state.language,
    learnerNotes: state.learnerNotes,
    learnerProfilePrompt: state.learnerProfilePrompt,
    selectedTemplate: state.selectedTemplate,
    templatePrompt: state.templatePrompt,
  };
}

function builderLeafText(
  state: PromptBuilderState | null,
  field: keyof PromptBuilderState
): string {
  return state?.[field] ?? "";
}

function displayVariability(value: number | null): string {
  return value === null ? "unset" : String(value);
}

function displayAssistedAuthoringMode(value: boolean): string {
  return value ? "on" : "off";
}

function pushChanged(
  diffs: ConfigFieldDiff[],
  field: string,
  earlier: string,
  later: string
): void {
  if (earlier !== later) {
    diffs.push({ field, earlier, later });
  }
}

export function decideVersionWrite(input: {
  latest: { id: string; updatedAt: string; sealed: boolean } | null;
  now: string;
  windowMs?: number;
}): VersionWriteDecision {
  const windowMs = input.windowMs ?? CONFIG_VERSION_WINDOW_MS;
  const latest = input.latest;
  if (latest === null || latest.sealed) {
    return { action: "insert" };
  }
  const elapsed = Date.parse(input.now) - Date.parse(latest.updatedAt);
  if (elapsed <= windowMs) {
    return { action: "update", versionId: latest.id };
  }
  return { action: "insert" };
}

export function diffConfigSnapshots(
  earlier: ConfigSnapshot,
  later: ConfigSnapshot
): ConfigFieldDiff[] {
  const diffs: ConfigFieldDiff[] = [];
  pushChanged(diffs, "name", earlier.name, later.name);
  pushChanged(diffs, "systemPrompt", earlier.systemPrompt, later.systemPrompt);
  pushChanged(diffs, "provider", earlier.provider, later.provider);
  pushChanged(diffs, "model", earlier.model, later.model);
  pushChanged(
    diffs,
    "variability",
    displayVariability(earlier.variability),
    displayVariability(later.variability)
  );
  pushChanged(
    diffs,
    "assistedAuthoringMode",
    displayAssistedAuthoringMode(earlier.assistedAuthoringMode),
    displayAssistedAuthoringMode(later.assistedAuthoringMode)
  );
  for (const field of BUILDER_LEAVES) {
    pushChanged(
      diffs,
      `builderState.${field}`,
      builderLeafText(earlier.builderState, field),
      builderLeafText(later.builderState, field)
    );
  }
  return diffs;
}

export function snapshotFromApp(app: AppConfig): ConfigSnapshot {
  return {
    name: app.name,
    provider: app.provider,
    model: app.model,
    variability: app.variability ?? null,
    systemPrompt: app.systemPrompt ?? "",
    assistedAuthoringMode: app.assistedAuthoringMode ?? true,
    builderState: app.builderState ? copyBuilderState(app.builderState) : null,
  };
}
