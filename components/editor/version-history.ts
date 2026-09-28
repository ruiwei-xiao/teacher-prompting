import { readResponseError } from "@/components/editor/publish-state";
import type { ConfigFieldDiff } from "@/lib/app-config-versions/types";
import type { PromptBuilderState, SupportedProvider } from "@/lib/app-store/types";

export const CURRENT_DRAFT_BADGE = "Current draft";
export const PUBLISHED_BADGE = "Published";
export const NO_PREVIOUS_VERSION_MESSAGE = "No previous version.";
export const DIFF_PREVIOUS_LABEL = "Previous";
export const DIFF_THIS_VERSION_LABEL = "This version";
export const REVERT_FAILURE_FALLBACK = "Failed to revert this version.";

const DETAIL_LABELS = {
  name: "Name",
  prompt: "Prompt",
  provider: "Provider",
  model: "Model",
  variability: "Variability",
  assistedMode: "Assisted mode",
} as const;

const BUILDER_FIELD_LABELS = {
  learningObjective: "Learning objective",
  learningObjectivePrompt: "Learning objective prompt",
  uploadedExerciseName: "Uploaded exercise name",
  uploadedExerciseText: "Uploaded exercise text",
  exercisePrompt: "Exercise prompt",
  gradeLevel: "Grade level",
  language: "Language",
  learnerNotes: "Learner notes",
  learnerProfilePrompt: "Learner profile prompt",
  selectedTemplate: "Selected template",
  templatePrompt: "Template prompt",
} as const satisfies Record<keyof PromptBuilderState, string>;

const BUILDER_FIELDS = Object.keys(BUILDER_FIELD_LABELS) as (keyof PromptBuilderState)[];

export type HistoryVersionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  isPublished: boolean;
};

export type HistoryVersionSnapshot = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  provider: string;
  model: string;
  variability: number | null;
  systemPrompt: string;
  assistedAuthoringMode: boolean;
  builderState: PromptBuilderState | null;
};

export type HistoryVersionDetail = {
  version: HistoryVersionSnapshot;
  previousVersionId: string | null;
  diff: ConfigFieldDiff[];
};

export type VersionDetailField = {
  label: string;
  value: string;
};

export type VersionComparison =
  | { kind: "none"; message: typeof NO_PREVIOUS_VERSION_MESSAGE }
  | {
      kind: "changes";
      rows: { field: string; previous: string; thisVersion: string }[];
    };

export type HistoryListRow = {
  id: string;
  updatedAtLabel: string;
  badges: string[];
  canRevert: boolean;
};

export type RevertDraft = {
  name: string;
  provider: string;
  model: string;
  variability: number | null;
  systemPrompt: string;
  assistedAuthoringMode: boolean;
  builderState: PromptBuilderState | null;
};

export type RevertSuccess = {
  version: {
    id: string;
    createdAt: string;
    updatedAt: string;
  };
  draft: RevertDraft;
};

export type VisibleEditorFields = {
  name: string;
  provider: string;
  model: string;
  variability: number | null;
  assistedAuthoringMode: boolean;
  prompt: string;
};

export type EditorRevertState = {
  latestVersionId: string | null;
  publishedVersionId: string | null;
  name: string;
  provider: string;
  model: string;
  variability: number | null;
  assistedAuthoringMode: boolean;
  prompt: string;
  storedPrompt: string;
  dirty: boolean;
  error: string | null;
};

export type AutosaveGate = {
  generation: number;
  prompt: string;
};

export function formatVersionTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function versionBadges(version: {
  isDraft: boolean;
  isPublished: boolean;
}): string[] {
  const badges: string[] = [];
  if (version.isDraft) badges.push(CURRENT_DRAFT_BADGE);
  if (version.isPublished) badges.push(PUBLISHED_BADGE);
  return badges;
}

export function canRevertVersion(version: { isDraft: boolean }): boolean {
  return !version.isDraft;
}

export function historyListRows(versions: readonly HistoryVersionSummary[]): HistoryListRow[] {
  return versions.map((version) => ({
    id: version.id,
    updatedAtLabel: formatVersionTimestamp(version.updatedAt),
    badges: versionBadges(version),
    canRevert: canRevertVersion(version),
  }));
}

export function displayVariability(value: number | null): string {
  return value === null ? "unset" : String(value);
}

export function displayAssistedMode(value: boolean): string {
  return value ? "on" : "off";
}

export function versionDetailFields(version: HistoryVersionSnapshot): VersionDetailField[] {
  const fields: VersionDetailField[] = [
    { label: DETAIL_LABELS.name, value: version.name },
    { label: DETAIL_LABELS.prompt, value: version.systemPrompt },
    { label: DETAIL_LABELS.provider, value: version.provider },
    { label: DETAIL_LABELS.model, value: version.model },
    { label: DETAIL_LABELS.variability, value: displayVariability(version.variability) },
    {
      label: DETAIL_LABELS.assistedMode,
      value: displayAssistedMode(version.assistedAuthoringMode),
    },
  ];
  for (const key of BUILDER_FIELDS) {
    fields.push({
      label: BUILDER_FIELD_LABELS[key],
      value: version.builderState?.[key] ?? "",
    });
  }
  return fields;
}

export function versionComparison(detail: {
  previousVersionId: string | null;
  diff: readonly ConfigFieldDiff[];
}): VersionComparison {
  if (detail.previousVersionId === null) {
    return { kind: "none", message: NO_PREVIOUS_VERSION_MESSAGE };
  }
  return {
    kind: "changes",
    rows: detail.diff.map((row) => ({
      field: row.field,
      previous: row.earlier,
      thisVersion: row.later,
    })),
  };
}

export function editorAfterSelectingVersion<T>(editor: T): T {
  return editor;
}

export function supportedProvider(value: string): SupportedProvider | null {
  if (value === "openai" || value === "google" || value === "anthropic") return value;
  return null;
}

export function visibleEditorFields(draft: RevertDraft): VisibleEditorFields {
  return {
    name: draft.name,
    provider: draft.provider,
    model: draft.model,
    variability: draft.variability,
    assistedAuthoringMode: draft.assistedAuthoringMode,
    prompt: draft.systemPrompt,
  };
}

export function mergeSuccessfulRevert<T extends EditorRevertState>(
  state: T,
  response: RevertSuccess
): T {
  const fields = visibleEditorFields(response.draft);
  return {
    ...state,
    latestVersionId: response.version.id,
    publishedVersionId: state.publishedVersionId,
    name: fields.name,
    provider: fields.provider,
    model: fields.model,
    variability: fields.variability,
    assistedAuthoringMode: fields.assistedAuthoringMode,
    prompt: fields.prompt,
    storedPrompt: fields.prompt,
    dirty: false,
  };
}

export function historyListAfterRevert(
  versions: readonly HistoryVersionSummary[],
  created: { id: string; createdAt: string; updatedAt: string },
  publishedVersionId: string | null
): HistoryVersionSummary[] {
  const sealed = versions
    .filter((version) => version.id !== created.id)
    .map((version) => (version.isDraft ? { ...version, isDraft: false } : version));
  return [
    {
      id: created.id,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      isDraft: true,
      isPublished: created.id === publishedVersionId,
    },
    ...sealed,
  ];
}

export function createAutosaveGate(prompt = ""): AutosaveGate {
  return { generation: 0, prompt };
}

export function openAutosave(
  gate: AutosaveGate,
  prompt: string
): { gate: AutosaveGate; requestId: number } {
  const requestId = gate.generation + 1;
  return {
    gate: { generation: requestId, prompt },
    requestId,
  };
}

export function autosaveIsCurrent(gate: AutosaveGate, requestId: number): boolean {
  return gate.generation === requestId;
}

export function applyExternalPromptBeforeSave(gate: AutosaveGate, prompt: string): AutosaveGate {
  return { generation: gate.generation + 1, prompt };
}

export function applyRevertedDraftBeforeSave<T extends EditorRevertState>(
  editor: T,
  response: RevertSuccess,
  gate: AutosaveGate,
  pendingRequestId: number
): { editor: T; gate: AutosaveGate; pendingStillSends: boolean } {
  const nextGate = applyExternalPromptBeforeSave(gate, response.draft.systemPrompt);
  return {
    editor: mergeSuccessfulRevert(editor, response),
    gate: nextGate,
    pendingStillSends: autosaveIsCurrent(nextGate, pendingRequestId),
  };
}

export function revertFailureMessage(body: unknown): string {
  return readResponseError(body, REVERT_FAILURE_FALLBACK);
}

export function settleFailedRevert<T>(
  state: T,
  body: unknown
): { state: T; dialogError: string } {
  return { state, dialogError: revertFailureMessage(body) };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readId(value: unknown): string | null {
  const id = readString(value);
  return id && id.length > 0 ? id : null;
}

function readBuilderState(value: unknown): PromptBuilderState | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const state = {} as PromptBuilderState;
  for (const key of BUILDER_FIELDS) {
    const leaf = value[key];
    if (typeof leaf !== "string") return undefined;
    state[key] = leaf;
  }
  return state;
}

function readVariability(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return value;
}

function readSnapshot(value: unknown): HistoryVersionSnapshot | null {
  if (!isRecord(value)) return null;
  const id = readId(value.id);
  const createdAt = readId(value.createdAt);
  const updatedAt = readId(value.updatedAt);
  const name = readString(value.name);
  const provider = readString(value.provider);
  const model = readString(value.model);
  const systemPrompt = readString(value.systemPrompt);
  const variability = readVariability(value.variability);
  const builderState = readBuilderState(value.builderState);
  if (
    !id ||
    !createdAt ||
    !updatedAt ||
    name === null ||
    provider === null ||
    model === null ||
    systemPrompt === null ||
    variability === undefined ||
    typeof value.assistedAuthoringMode !== "boolean" ||
    builderState === undefined
  ) {
    return null;
  }
  return {
    id,
    createdAt,
    updatedAt,
    name,
    provider,
    model,
    variability,
    systemPrompt,
    assistedAuthoringMode: value.assistedAuthoringMode,
    builderState,
  };
}

function readSummary(value: unknown): HistoryVersionSummary | null {
  if (!isRecord(value)) return null;
  const id = readId(value.id);
  const createdAt = readId(value.createdAt);
  const updatedAt = readId(value.updatedAt);
  if (
    !id ||
    !createdAt ||
    !updatedAt ||
    typeof value.isDraft !== "boolean" ||
    typeof value.isPublished !== "boolean"
  ) {
    return null;
  }
  return {
    id,
    createdAt,
    updatedAt,
    isDraft: value.isDraft,
    isPublished: value.isPublished,
  };
}

function readDiff(value: unknown): ConfigFieldDiff[] | null {
  if (!Array.isArray(value)) return null;
  const rows: ConfigFieldDiff[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const field = readString(item.field);
    const earlier = readString(item.earlier);
    const later = readString(item.later);
    if (field === null || earlier === null || later === null) return null;
    rows.push({ field, earlier, later });
  }
  return rows;
}

function readDraft(value: unknown): RevertDraft | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  const provider = readString(value.provider);
  const model = readString(value.model);
  const systemPrompt = readString(value.systemPrompt);
  const variability = readVariability(value.variability);
  const builderState = readBuilderState(value.builderState);
  if (
    name === null ||
    provider === null ||
    model === null ||
    systemPrompt === null ||
    variability === undefined ||
    typeof value.assistedAuthoringMode !== "boolean" ||
    builderState === undefined
  ) {
    return null;
  }
  return {
    name,
    provider,
    model,
    variability,
    systemPrompt,
    assistedAuthoringMode: value.assistedAuthoringMode,
    builderState,
  };
}

export function readHistoryList(body: unknown): HistoryVersionSummary[] | null {
  if (!isRecord(body) || !Array.isArray(body.versions)) return null;
  const versions: HistoryVersionSummary[] = [];
  for (const item of body.versions) {
    const summary = readSummary(item);
    if (!summary) return null;
    versions.push(summary);
  }
  return versions;
}

export function readHistoryDetail(body: unknown): HistoryVersionDetail | null {
  if (!isRecord(body)) return null;
  const version = readSnapshot(body.version);
  const diff = readDiff(body.diff);
  if (!version || !diff) return null;
  if (body.previousVersionId === null) {
    return { version, previousVersionId: null, diff };
  }
  const previousVersionId = readId(body.previousVersionId);
  if (!previousVersionId) return null;
  return { version, previousVersionId, diff };
}

export function readRevertSuccess(body: unknown): RevertSuccess | null {
  if (!isRecord(body) || !isRecord(body.version)) return null;
  const id = readId(body.version.id);
  const createdAt = readId(body.version.createdAt);
  const updatedAt = readId(body.version.updatedAt);
  const draft = readDraft(body.draft);
  if (!id || !createdAt || !updatedAt || !draft) return null;
  return {
    version: { id, createdAt, updatedAt },
    draft,
  };
}
