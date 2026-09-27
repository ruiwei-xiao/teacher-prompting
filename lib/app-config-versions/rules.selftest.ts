/**
 * Self-test: configuration version decision rules (Task 1.1).
 * Run: npx tsx lib/app-config-versions/rules.selftest.ts
 */
import type { AppConfig, PromptBuilderState } from "../app-store/types";
import {
  CONFIG_VERSION_WINDOW_MS,
  decideVersionWrite,
  diffConfigSnapshots,
  snapshotFromApp,
} from "./rules";
import type { ConfigSnapshot } from "./types";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

const UPDATED_AT = "2026-09-27T12:00:00.000Z";

function isoAfter(start: string, deltaMs: number): string {
  return new Date(Date.parse(start) + deltaMs).toISOString();
}

function builderState(
  overrides: Partial<PromptBuilderState> = {}
): PromptBuilderState {
  return {
    learningObjective: "Add fractions",
    learningObjectivePrompt: "Objective prompt",
    uploadedExerciseName: "Worksheet A",
    uploadedExerciseText: "Solve 1/2 + 1/4.",
    exercisePrompt: "Exercise prompt",
    gradeLevel: "5",
    language: "English",
    learnerNotes: "Needs visual models",
    learnerProfilePrompt: "Learner prompt",
    selectedTemplate: "guided-practice",
    templatePrompt: "Template prompt",
    ...overrides,
  };
}

function appConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    id: "app_1",
    name: "Fraction tutor",
    provider: "openai",
    model: "gpt-4.1",
    apiKey: "sk-live-secret",
    variability: undefined,
    systemPrompt: "Be kind.\n\nReference:\nChapter 1 on photosynthesis",
    builderState: builderState(),
    assistedAuthoringMode: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function main(): void {
  assertEqual(
    CONFIG_VERSION_WINDOW_MS,
    15 * 60 * 1000,
    "window is 15 minutes in milliseconds"
  );

  const latest = { id: "ver_draft", updatedAt: UPDATED_AT, sealed: false };

  assertEqual(
    decideVersionWrite({
      latest,
      now: isoAfter(UPDATED_AT, CONFIG_VERSION_WINDOW_MS),
    }),
    { action: "update", versionId: "ver_draft" },
    "exact 15-minute boundary updates the same version"
  );

  assertEqual(
    decideVersionWrite({
      latest,
      now: isoAfter(UPDATED_AT, 60 * 1000),
    }),
    { action: "update", versionId: "ver_draft" },
    "an unsealed draft inside the window updates in place"
  );

  assertEqual(
    decideVersionWrite({
      latest,
      now: isoAfter(UPDATED_AT, CONFIG_VERSION_WINDOW_MS + 1),
    }),
    { action: "insert" },
    "one millisecond past 15 minutes inserts a new version"
  );

  assertEqual(
    decideVersionWrite({ latest: null, now: UPDATED_AT }),
    { action: "insert" },
    "a missing draft inserts a new version"
  );

  assertEqual(
    decideVersionWrite({
      latest: { id: "ver_published", updatedAt: UPDATED_AT, sealed: true },
      now: UPDATED_AT,
    }),
    { action: "insert" },
    "a sealed latest version inserts regardless of age"
  );

  assertEqual(
    decideVersionWrite({
      latest: {
        id: "ver_published",
        updatedAt: isoAfter(UPDATED_AT, -1_000),
        sealed: true,
      },
      now: UPDATED_AT,
      windowMs: 60 * 60 * 1000,
    }),
    { action: "insert" },
    "a sealed latest version inserts even inside a custom window"
  );

  assertEqual(
    decideVersionWrite({
      latest,
      now: isoAfter(UPDATED_AT, 1_000),
      windowMs: 1_000,
    }),
    { action: "update", versionId: "ver_draft" },
    "a custom window includes its exact boundary"
  );

  assertEqual(
    decideVersionWrite({
      latest,
      now: isoAfter(UPDATED_AT, 1_001),
      windowMs: 1_000,
    }),
    { action: "insert" },
    "a custom window inserts one millisecond past its boundary"
  );

  const source = appConfig({
    publicSlug: "public-link",
    projectShareSlug: "share-link",
    publishedAt: "2026-09-20T00:00:00.000Z",
    projectSharedAt: "2026-09-21T00:00:00.000Z",
    projectShareVisibility: "public",
    shareAuthorName: true,
    communitySubject: "Science",
    communityTags: ["biology"],
    forkedFromProjectName: "Original bot",
    forkedFromProjectShareSlug: "original-slug",
    forkedFromAuthorName: "Ada",
  });
  const snapshot = snapshotFromApp(source);

  assertEqual(
    Object.keys(snapshot).sort(),
    [
      "assistedAuthoringMode",
      "builderState",
      "model",
      "name",
      "provider",
      "systemPrompt",
      "variability",
    ],
    "snapshot stores only tutoring settings"
  );

  const encoded = JSON.stringify(snapshot);
  const excludedValues = [
    "sk-live-secret",
    "public-link",
    "share-link",
    "2026-09-20T00:00:00.000Z",
    "2026-09-21T00:00:00.000Z",
    "Science",
    "biology",
    "Original bot",
    "original-slug",
    "Ada",
  ];
  for (const value of excludedValues) {
    assert(!encoded.includes(value), `snapshot excludes ${value}`);
  }
  assert(!("apiKey" in snapshot), "snapshot has no API key field");
  assert(!("publicSlug" in snapshot), "snapshot has no public link field");
  assert(!("publishedAt" in snapshot), "snapshot has no publication field");
  assert(!("projectShareSlug" in snapshot), "snapshot has no share field");
  assert(!("communitySubject" in snapshot), "snapshot has no community field");
  assert(
    !("forkedFromProjectName" in snapshot),
    "snapshot has no fork credit field"
  );

  assertEqual(snapshot.name, "Fraction tutor", "snapshot keeps the bot name");
  assertEqual(
    snapshot.systemPrompt,
    "Be kind.\n\nReference:\nChapter 1 on photosynthesis",
    "snapshot keeps the final prompt including attached reference text"
  );
  assertEqual(snapshot.provider, "openai", "snapshot keeps the provider");
  assertEqual(snapshot.model, "gpt-4.1", "snapshot keeps the model");
  assertEqual(snapshot.variability, null, "omitted variability is unset");
  assertEqual(
    snapshot.assistedAuthoringMode,
    true,
    "explicit assisted authoring on stays on"
  );
  assertEqual(
    snapshot.builderState,
    builderState(),
    "snapshot keeps stored pedagogical builder inputs"
  );

  const mutable = builderState();
  const copied = snapshotFromApp(appConfig({ builderState: mutable }));
  mutable.learningObjective = "mutated after copy";
  assertEqual(
    copied.builderState?.learningObjective,
    "Add fractions",
    "snapshot copies builder inputs instead of aliasing them"
  );

  assertEqual(
    snapshotFromApp(appConfig({ assistedAuthoringMode: undefined }))
      .assistedAuthoringMode,
    true,
    "missing assisted authoring resolves to the app default on"
  );
  assertEqual(
    snapshotFromApp(appConfig({ assistedAuthoringMode: false }))
      .assistedAuthoringMode,
    false,
    "explicit assisted authoring off stays off"
  );
  assertEqual(
    snapshotFromApp(appConfig({ variability: 0 })).variability,
    0,
    "stored zero variability stays zero"
  );
  assertEqual(
    snapshotFromApp(appConfig({ systemPrompt: undefined })).systemPrompt,
    "",
    "missing system prompt is an empty stored string"
  );
  assertEqual(
    snapshotFromApp(appConfig({ builderState: undefined })).builderState,
    null,
    "missing builder inputs are null"
  );

  const earlier = snapshotFromApp(appConfig());
  const promptChanged = snapshotFromApp(
    appConfig({
      systemPrompt: "Be strict.\n\nReference:\nChapter 1 on photosynthesis",
    })
  );
  assertEqual(
    diffConfigSnapshots(earlier, promptChanged),
    [
      {
        field: "systemPrompt",
        earlier: "Be kind.\n\nReference:\nChapter 1 on photosynthesis",
        later: "Be strict.\n\nReference:\nChapter 1 on photosynthesis",
      },
    ],
    "a prompt change lists the earlier and later prompt"
  );

  const modelChanged = snapshotFromApp(appConfig({ model: "gpt-4.1-mini" }));
  assertEqual(
    diffConfigSnapshots(earlier, modelChanged),
    [
      {
        field: "model",
        earlier: "gpt-4.1",
        later: "gpt-4.1-mini",
      },
    ],
    "a model change lists only the model"
  );

  assertEqual(
    diffConfigSnapshots(earlier, snapshotFromApp(appConfig())),
    [],
    "unchanged snapshots list no settings"
  );

  assertEqual(
    diffConfigSnapshots(
      earlier,
      snapshotFromApp(appConfig({ apiKey: "sk-other-secret", publicSlug: "other-link" }))
    ),
    [],
    "excluded secret and link fields are not diffed"
  );

  const changed: ConfigSnapshot = snapshotFromApp(
    appConfig({
      name: "Algebra tutor",
      provider: "google",
      model: "gemini-2.5-flash",
      variability: 0.5,
      systemPrompt: "Be brief.",
      assistedAuthoringMode: false,
      builderState: builderState({
        learningObjective: "Subtract fractions",
        gradeLevel: "6",
      }),
    })
  );
  assertEqual(
    diffConfigSnapshots(earlier, changed),
    [
      { field: "name", earlier: "Fraction tutor", later: "Algebra tutor" },
      {
        field: "systemPrompt",
        earlier: "Be kind.\n\nReference:\nChapter 1 on photosynthesis",
        later: "Be brief.",
      },
      { field: "provider", earlier: "openai", later: "google" },
      { field: "model", earlier: "gpt-4.1", later: "gemini-2.5-flash" },
      { field: "variability", earlier: "unset", later: "0.5" },
      { field: "assistedAuthoringMode", earlier: "on", later: "off" },
      {
        field: "builderState.learningObjective",
        earlier: "Add fractions",
        later: "Subtract fractions",
      },
      { field: "builderState.gradeLevel", earlier: "5", later: "6" },
    ],
    "diff walks changed settings in snapshot order and omits unchanged leaves"
  );

  const fromNullBuilder = snapshotFromApp(appConfig({ builderState: undefined }));
  assertEqual(
    diffConfigSnapshots(fromNullBuilder, earlier).filter((row) =>
      row.field.startsWith("builderState.")
    ),
    [
      {
        field: "builderState.learningObjective",
        earlier: "",
        later: "Add fractions",
      },
      {
        field: "builderState.learningObjectivePrompt",
        earlier: "",
        later: "Objective prompt",
      },
      {
        field: "builderState.uploadedExerciseName",
        earlier: "",
        later: "Worksheet A",
      },
      {
        field: "builderState.uploadedExerciseText",
        earlier: "",
        later: "Solve 1/2 + 1/4.",
      },
      {
        field: "builderState.exercisePrompt",
        earlier: "",
        later: "Exercise prompt",
      },
      { field: "builderState.gradeLevel", earlier: "", later: "5" },
      { field: "builderState.language", earlier: "", later: "English" },
      {
        field: "builderState.learnerNotes",
        earlier: "",
        later: "Needs visual models",
      },
      {
        field: "builderState.learnerProfilePrompt",
        earlier: "",
        later: "Learner prompt",
      },
      {
        field: "builderState.selectedTemplate",
        earlier: "",
        later: "guided-practice",
      },
      {
        field: "builderState.templatePrompt",
        earlier: "",
        later: "Template prompt",
      },
    ],
    "each builder leaf is compared, and a missing builder is empty text"
  );

  if (failures > 0) {
    console.error(`\nrules.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("rules.selftest: all assertions passed");
}

try {
  main();
} catch (err) {
  console.error("rules.selftest crashed:", err);
  process.exit(1);
}
