/**
 * Editor version history: list badges, detail, diff, and revert application.
 *
 * Run: npx tsx components/editor/version-history.selftest.ts
 */

import { deriveEditorPublishChrome } from "./publish-state";
import { formatSessionStartTime } from "../sessions/session-display";
import type { PromptBuilderState } from "../../lib/app-store/types";
import {
  applyRevertedDraftBeforeSave,
  autosaveIsCurrent,
  canRevertVersion,
  createAutosaveGate,
  CURRENT_DRAFT_BADGE,
  DIFF_PREVIOUS_LABEL,
  DIFF_THIS_VERSION_LABEL,
  displayAssistedMode,
  displayVariability,
  editorAfterSelectingVersion,
  formatVersionTimestamp,
  historyListAfterRevert,
  historyListRows,
  mergeSuccessfulRevert,
  NO_PREVIOUS_VERSION_MESSAGE,
  openAutosave,
  promptTextMatchesStored,
  PUBLISHED_BADGE,
  readHistoryDetail,
  readHistoryList,
  readRevertSuccess,
  settleFailedRevert,
  versionBadges,
  versionComparison,
  versionDetailFields,
  visibleEditorFields,
  type EditorRevertState,
  type HistoryVersionSnapshot,
} from "./version-history";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function builderState(overrides: Partial<PromptBuilderState> = {}): PromptBuilderState {
  return {
    learningObjective: "Add fractions",
    learningObjectivePrompt: "Objective prompt",
    uploadedExerciseName: "worksheet.pdf",
    uploadedExerciseText: "Exercise text",
    exercisePrompt: "Exercise prompt",
    gradeLevel: "5",
    language: "English",
    learnerNotes: "Notes",
    learnerProfilePrompt: "Profile prompt",
    selectedTemplate: "socratic",
    templatePrompt: "Template prompt",
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<HistoryVersionSnapshot> = {}
): HistoryVersionSnapshot {
  return {
    id: "version-1",
    createdAt: "2026-03-01T15:04:00.000Z",
    updatedAt: "2026-03-02T18:30:00.000Z",
    name: "Fractions tutor",
    provider: "openai",
    model: "gpt-5.4-mini",
    variability: null,
    systemPrompt: "Help students add fractions.",
    assistedAuthoringMode: false,
    builderState: builderState(),
    ...overrides,
  };
}

function editorState(
  overrides: Partial<EditorRevertState> = {}
): EditorRevertState {
  return {
    latestVersionId: "draft-2",
    publishedVersionId: "published-1",
    name: "Current name",
    provider: "google",
    model: "gemini-2.5-flash",
    variability: 40,
    assistedAuthoringMode: true,
    prompt: "current prompt",
    storedPrompt: "current prompt",
    dirty: true,
    error: null,
    ...overrides,
  };
}

const createdAt = "2026-03-01T15:04:00.000Z";
const updatedAt = "2026-03-02T18:30:00.000Z";
const revertedAt = "2026-03-03T12:05:00.000Z";

console.log("Test 0: opening the editor does not count a trimmed prompt as a new edit");
{
  assert(
    promptTextMatchesStored("teach japanese.\nplease teach for those who is A1 level.\n", "teach japanese.\nplease teach for those who is A1 level."),
    "a trailing newline matches the opened prompt"
  );
  assert(
    promptTextMatchesStored("  teach japanese.  ", "teach japanese."),
    "surrounding spaces match the opened prompt"
  );
  assert(
    !promptTextMatchesStored("teach japanese.", "teach english."),
    "a real prompt edit does not match"
  );
}

console.log("Test 1: timestamps match the session start format");
{
  assertEqual(
    formatVersionTimestamp(updatedAt),
    formatSessionStartTime(updatedAt),
    "updated time uses the same en-US medium date and short time"
  );
  assert(
    formatVersionTimestamp(updatedAt) !== updatedAt,
    "a valid timestamp is formatted"
  );
  assertEqual(
    formatVersionTimestamp("not-a-date"),
    "not-a-date",
    "invalid timestamps stay unchanged"
  );
}

console.log("Test 2: list badges and revert availability follow the owner summary");
{
  const versions = [
    {
      id: "draft-2",
      createdAt: revertedAt,
      updatedAt: revertedAt,
      isDraft: true,
      isPublished: false,
    },
    {
      id: "published-1",
      createdAt,
      updatedAt,
      isDraft: false,
      isPublished: true,
    },
  ];
  const listed = readHistoryList({
    versions: versions.map((version) => ({
      ...version,
      systemPrompt: "hidden prompt",
      apiKey: "sk-secret",
    })),
  });
  assert(listed !== null, "owner list parses");
  if (!listed) throw new Error("owner list parses");
  assertEqual(listed.length, 2, "endpoint rows are kept");
  assertEqual(listed[0].id, "draft-2", "list order matches the endpoint");
  assertEqual(listed[1].id, "published-1", "older row stays second");
  assert(!JSON.stringify(listed).includes("sk-secret"), "list drops API keys");
  assert(!JSON.stringify(listed).includes("hidden prompt"), "list drops prompts");

  const rows = historyListRows(listed);
  assertEqual(rows[0].id, "draft-2", "rows keep endpoint order");
  assertEqual(rows[0].badges.join("|"), CURRENT_DRAFT_BADGE, "draft badge");
  assertEqual(rows[0].badges[0], "Current draft", "exact current draft badge");
  assertEqual(rows[0].canRevert, false, "current draft has no revert");
  assertEqual(rows[0].updatedAtLabel, formatSessionStartTime(revertedAt), "row time");
  assertEqual(rows[1].badges.join("|"), PUBLISHED_BADGE, "published badge");
  assertEqual(rows[1].badges[0], "Published", "exact published badge");
  assertEqual(rows[1].canRevert, true, "sealed published row can revert");

  const both = versionBadges({ isDraft: true, isPublished: true });
  assertEqual(both.join("|"), "Current draft|Published", "both badges");
  assertEqual(canRevertVersion({ isDraft: true }), false, "draft cannot revert");
  assertEqual(versionBadges({ isDraft: false, isPublished: false }).length, 0, "no badges");
}

console.log("Test 3: detail is read-only and the earliest version has no previous version");
{
  const version = snapshot();
  const detail = readHistoryDetail({
    version: { ...version, apiKey: "sk-secret", publishedApiKey: "sk-published" },
    previousVersionId: null,
    diff: [],
  });
  assert(detail !== null, "detail parses");
  if (!detail) throw new Error("detail parses");
  assert(!JSON.stringify(detail).includes("sk-secret"), "detail drops API keys");
  assert(!JSON.stringify(detail).includes("sk-published"), "detail drops published API keys");

  const fields = versionDetailFields(detail.version);
  const byLabel = new Map(fields.map((field) => [field.label, field.value]));
  assertEqual(byLabel.get("Name"), "Fractions tutor", "name");
  assertEqual(byLabel.get("Prompt"), "Help students add fractions.", "prompt");
  assertEqual(byLabel.get("Provider"), "openai", "provider");
  assertEqual(byLabel.get("Model"), "gpt-5.4-mini", "model");
  assertEqual(byLabel.get("Variability"), "unset", "null variability");
  assertEqual(displayVariability(null), "unset", "unset display");
  assertEqual(byLabel.get("Assisted mode"), "off", "assisted mode off");
  assertEqual(displayAssistedMode(true), "on", "assisted mode on");
  assertEqual(byLabel.get("Learning objective"), "Add fractions", "builder leaf");
  assertEqual(fields.length, 17, "settings plus every filled builder leaf");
  assert(
    !fields.some((field) => field.label.toLowerCase().includes("api")),
    "detail labels omit API keys"
  );

  const emptyBuilder = versionDetailFields(snapshot({ builderState: null }));
  assertEqual(emptyBuilder.length, 6, "null builder omits builder leaves");
  assert(
    !emptyBuilder.some((field) => field.label === "Learning objective"),
    "null builder hides the learning objective"
  );

  const partialBuilder = versionDetailFields(
    snapshot({
      name: "",
      builderState: builderState({
        learningObjective: "  Add fractions  ",
        learningObjectivePrompt: "",
        uploadedExerciseName: "   ",
        gradeLevel: "5",
      }),
    })
  );
  assertEqual(
    partialBuilder.find((field) => field.label === "Name")?.value,
    "",
    "an empty core field stays visible"
  );
  assertEqual(
    partialBuilder.find((field) => field.label === "Learning objective")?.value,
    "Add fractions",
    "a filled builder leaf is trimmed and shown"
  );
  assertEqual(
    partialBuilder.find((field) => field.label === "Grade level")?.value,
    "5",
    "another filled builder leaf stays visible"
  );
  assert(
    !partialBuilder.some((field) => field.label === "Learning objective prompt"),
    "an empty builder leaf is hidden"
  );
  assert(
    !partialBuilder.some((field) => field.label === "Uploaded exercise name"),
    "a blank builder leaf is hidden"
  );

  const comparison = versionComparison(detail);
  assertEqual(comparison.kind, "none", "earliest comparison kind");
  if (comparison.kind !== "none") throw new Error("earliest comparison kind");
  assertEqual(comparison.message, NO_PREVIOUS_VERSION_MESSAGE, "no previous copy");
  assertEqual(comparison.message, "No previous version.", "exact no previous copy");

  const selected = editorAfterSelectingVersion(editorState());
  assertEqual(selected.prompt, "current prompt", "selecting a version keeps the draft prompt");
  assertEqual(selected.latestVersionId, "draft-2", "selecting a version keeps the latest id");
  assertEqual(
    selected.publishedVersionId,
    "published-1",
    "selecting a version keeps the published id"
  );
}

console.log("Test 4: diff uses server fields and previous / this version values");
{
  const detail = readHistoryDetail({
    version: snapshot({ id: "version-2", variability: 20, assistedAuthoringMode: true }),
    previousVersionId: "version-1",
    diff: [
      { field: "variability", earlier: "unset", later: "20" },
      { field: "assistedAuthoringMode", earlier: "off", later: "on" },
      {
        field: "builderState.learningObjective",
        earlier: "Add fractions",
        later: "Subtract fractions",
      },
    ],
  });
  assert(detail !== null, "changed detail parses");
  if (!detail) throw new Error("changed detail parses");
  const comparison = versionComparison(detail);
  assertEqual(comparison.kind, "changes", "comparison with a previous version");
  if (comparison.kind !== "changes") throw new Error("comparison with a previous version");
  assertEqual(comparison.rows.length, 3, "server diff rows are kept");
  assertEqual(comparison.rows[0].field, "variability", "server field name");
  assertEqual(comparison.rows[0].previous, "unset", "previous value");
  assertEqual(comparison.rows[0].thisVersion, "20", "this version value");
  assertEqual(comparison.rows[1].field, "assistedAuthoringMode", "assisted field");
  assertEqual(comparison.rows[1].previous, "off", "server assisted display");
  assertEqual(comparison.rows[1].thisVersion, "on", "server assisted later display");
  assertEqual(
    comparison.rows[2].field,
    "builderState.learningObjective",
    "builder diff field"
  );
  assertEqual(DIFF_PREVIOUS_LABEL, "Previous", "previous label");
  assertEqual(DIFF_THIS_VERSION_LABEL, "This version", "this version label");
  assert(versionComparison(detail).kind !== "none", "a previous id is not the empty message");
}

console.log("Test 5: successful revert applies the server draft before another prompt save");
{
  const response = readRevertSuccess({
    version: {
      id: "server-version-9",
      createdAt: revertedAt,
      updatedAt: revertedAt,
      apiKey: "sk-secret",
    },
    draft: {
      name: "Restored bot",
      provider: "openai",
      model: "gpt-5.4-mini",
      variability: null,
      systemPrompt: "reverted prompt",
      assistedAuthoringMode: false,
      builderState: builderState({ learningObjective: "Subtract fractions" }),
      apiKey: "sk-secret",
      publishedApiKey: "sk-published",
    },
  });
  assert(response !== null, "revert success parses");
  if (!response) throw new Error("revert success parses");
  assert(!JSON.stringify(response).includes("sk-secret"), "revert payload drops API keys");
  assert(
    !JSON.stringify(response).includes("sk-published"),
    "revert payload drops the published API key"
  );
  assertEqual(response.version.id, "server-version-9", "returned version id");

  const before = editorState();
  let gate = createAutosaveGate("current prompt");
  const pending = openAutosave(gate, "old unsaved prompt");
  gate = pending.gate;
  assert(autosaveIsCurrent(gate, pending.requestId), "queued save would send");

  const applied = applyRevertedDraftBeforeSave(before, response, gate, pending.requestId);
  assertEqual(applied.pendingStillSends, false, "stale autosave is canceled");
  assertEqual(applied.editor.prompt, "reverted prompt", "prompt is applied before the next save");
  assertEqual(applied.editor.storedPrompt, "reverted prompt", "stored prompt matches the draft");
  assertEqual(applied.editor.name, "Restored bot", "name");
  assertEqual(applied.editor.provider, "openai", "provider");
  assertEqual(applied.editor.model, "gpt-5.4-mini", "model");
  assertEqual(applied.editor.variability, null, "variability");
  assertEqual(applied.editor.assistedAuthoringMode, false, "assisted mode");
  assertEqual(applied.editor.latestVersionId, "server-version-9", "latest id is the returned id");
  assertEqual(
    applied.editor.publishedVersionId,
    "published-1",
    "published id stays in place"
  );
  assertEqual(applied.editor.dirty, false, "server draft is not a local dirty edit");
  assertEqual(applied.gate.prompt, "reverted prompt", "next save text is the reverted prompt");
  assert(!autosaveIsCurrent(applied.gate, pending.requestId), "pending request id is stale");

  const nextSave = openAutosave(applied.gate, applied.editor.prompt);
  assertEqual(nextSave.gate.prompt, "reverted prompt", "the save after revert uses the draft");
  assert(autosaveIsCurrent(nextSave.gate, nextSave.requestId), "the new save is current");

  const merged = mergeSuccessfulRevert(before, response);
  const chrome = deriveEditorPublishChrome(merged);
  const sameRule = deriveEditorPublishChrome({
    latestVersionId: response.version.id,
    publishedVersionId: before.publishedVersionId,
  });
  assertEqual(chrome.actionLabel, sameRule.actionLabel, "publish action uses the same ids");
  assertEqual(chrome.notice, sameRule.notice, "publish notice uses the same ids");
  assertEqual(chrome.statusLabel, sameRule.statusLabel, "published status uses the same ids");
  assertEqual(chrome.actionLabel, "Republish", "a new draft differs from the published id");
  assertEqual(chrome.notice, "You have unpublished changes.", "unpublished notice");

  const neverPublished = mergeSuccessfulRevert(
    editorState({ publishedVersionId: null }),
    response
  );
  assertEqual(
    deriveEditorPublishChrome(neverPublished).actionLabel,
    "Publish",
    "a missing published id stays Publish"
  );

  const fields = visibleEditorFields(response.draft);
  assertEqual(fields.prompt, "reverted prompt", "visible prompt");
  assertEqual(fields.variability, null, "visible variability stays null");

  const history = historyListAfterRevert(
    [
      {
        id: "published-1",
        createdAt,
        updatedAt,
        isDraft: true,
        isPublished: true,
      },
    ],
    response.version,
    "published-1"
  );
  assertEqual(history[0].id, "server-version-9", "appended row uses the returned id");
  assertEqual(history[0].isDraft, true, "appended row is the current draft");
  assertEqual(history[0].isPublished, false, "appended row does not become published");
  assertEqual(canRevertVersion(history[0]), false, "new draft has no revert");
  assertEqual(history[1].id, "published-1", "previous row remains");
  assertEqual(history[1].isDraft, false, "previous draft is no longer current");
  assertEqual(history[1].isPublished, true, "published badge stays on the published id");
}

console.log("Test 6: a failed revert shows the response error and leaves the editor draft");
{
  const before = editorState();
  const body = {
    error: "Failed to revert this version.",
    apiKey: "sk-secret",
  };
  const settled = settleFailedRevert(before, body);
  assertEqual(settled.dialogError, "Failed to revert this version.", "response error");
  assert(!settled.dialogError.includes("sk-secret"), "error text omits API keys");
  assert(settled.state === before, "failed revert returns the same editor state");
  assertEqual(settled.state.latestVersionId, "draft-2", "latest id unchanged");
  assertEqual(settled.state.publishedVersionId, "published-1", "published id unchanged");
  assertEqual(settled.state.prompt, "current prompt", "prompt unchanged");
  assertEqual(settled.state.name, "Current name", "name unchanged");
  assertEqual(settled.state.dirty, true, "dirty editor state unchanged");

  const draftRevert = settleFailedRevert(before, {
    error: "The current draft cannot be reverted.",
  });
  assertEqual(
    draftRevert.dialogError,
    "The current draft cannot be reverted.",
    "draft revert error"
  );
  assert(draftRevert.state === before, "rejected draft revert does not change the editor");
}

console.log("version-history.selftest: ok");
