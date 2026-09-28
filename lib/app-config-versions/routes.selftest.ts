/**
 * Self-test: owner version history list and detail routes (Task 2.4).
 * Run: npx tsx lib/app-config-versions/routes.selftest.ts
 */
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import type { AppConfig, PromptBuilderState } from "../app-store/types";
import type { ConfigVersionRecord } from "./types";

type RouteSession = { user?: { id?: string } } | null;

type StoredVersion = ConfigVersionRecord & {
  apiKey: string;
  publishedApiKey: string;
};

type JsonResponse = {
  status: number;
  body: unknown;
  text: string;
};

const APP_API_KEY = "SENTINEL_APP_API_KEY";
const PUBLISHED_API_KEY = "SENTINEL_PUBLISHED_API_KEY";
const VERSION_API_KEY = "SENTINEL_VERSION_API_KEY";
const VERSION_PUBLISHED_API_KEY = "SENTINEL_VERSION_PUBLISHED_API_KEY";
const SESSION_PROMPT = "SENTINEL_SESSION_COPY_PROMPT";
const OTHER_APP_PROMPT = "OTHER_APP_PROMPT_SHOULD_NOT_LEAK";
const APP_ROW_PROMPT = "APP_ROW_PROMPT_SHOULD_NOT_LEAK";

const AUTH_MOCK_PATH = path.join(
  process.cwd(),
  ".data",
  "config-version-route-auth-mock.mjs"
);

let failures = 0;
let listGet: (
  req: Request,
  context: { params: Promise<{ appId: string }> }
) => Promise<Response>;
let detailGet: (
  req: Request,
  context: { params: Promise<{ appId: string; versionId: string }> }
) => Promise<Response>;

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

function setSession(session: RouteSession): void {
  (globalThis as { __configVersionRouteSession?: RouteSession }).__configVersionRouteSession =
    session;
}

function installAuthMock(): void {
  fs.mkdirSync(path.dirname(AUTH_MOCK_PATH), { recursive: true });
  fs.writeFileSync(
    AUTH_MOCK_PATH,
    `export async function auth() {
  const session = globalThis.__configVersionRouteSession;
  return session === undefined ? null : session;
}
`,
    "utf-8"
  );
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@/auth") {
        return {
          url: pathToFileURL(AUTH_MOCK_PATH).href,
          shortCircuit: true,
          format: "module",
        };
      }
      return nextResolve(specifier, context);
    },
  });
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

function stubApp(overrides: Partial<AppConfig> & Pick<AppConfig, "id">): AppConfig {
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-a",
    name: overrides.name ?? `App ${overrides.id}`,
    description: overrides.description ?? "A tutoring bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    apiKey: overrides.apiKey ?? APP_API_KEY,
    variability: overrides.variability,
    systemPrompt: overrides.systemPrompt,
    builderState: overrides.builderState,
    assistedAuthoringMode: overrides.assistedAuthoringMode,
    publishedAt: overrides.publishedAt,
    publishedVersionId: overrides.publishedVersionId,
    publishedApiKey: overrides.publishedApiKey,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function versionRecord(
  overrides: Partial<StoredVersion> & Pick<StoredVersion, "id" | "appId">
): StoredVersion {
  return {
    name: overrides.name ?? "Historical name",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    variability: overrides.variability === undefined ? null : overrides.variability,
    systemPrompt: overrides.systemPrompt ?? "Older prompt",
    assistedAuthoringMode: overrides.assistedAuthoringMode ?? true,
    builderState: overrides.builderState === undefined ? null : overrides.builderState,
    id: overrides.id,
    appId: overrides.appId,
    kind: overrides.kind ?? "edit",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    sealedAt: overrides.sealedAt === undefined ? "2026-01-01T00:00:00.000Z" : overrides.sealedAt,
    apiKey: overrides.apiKey ?? VERSION_API_KEY,
    publishedApiKey: overrides.publishedApiKey ?? VERSION_PUBLISHED_API_KEY,
  };
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await fsPromises.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

async function restore(file: string, previous: string | null): Promise<void> {
  if (previous === null) {
    await fsPromises.rm(file, { force: true });
  } else {
    await fsPromises.writeFile(file, previous, "utf-8");
  }
}

async function withTempStore(
  apps: AppConfig[],
  versions: StoredVersion[],
  sessions: string,
  fn: (files: { apps: string; versions: string; sessions: string }) => Promise<void>
): Promise<void> {
  const dir = path.join(process.cwd(), ".data");
  const appsFile = path.join(dir, "apps.json");
  const versionsFile = path.join(dir, "app-config-versions.json");
  const sessionsFile = path.join(dir, "chat-sessions.json");
  await fsPromises.mkdir(dir, { recursive: true });
  const previousApps = await readOptional(appsFile);
  const previousVersions = await readOptional(versionsFile);
  const previousSessions = await readOptional(sessionsFile);
  await fsPromises.writeFile(appsFile, JSON.stringify(apps, null, 2), "utf-8");
  await fsPromises.writeFile(
    versionsFile,
    JSON.stringify({ versions }, null, 2),
    "utf-8"
  );
  await fsPromises.writeFile(sessionsFile, sessions, "utf-8");
  try {
    await fn({ apps: appsFile, versions: versionsFile, sessions: sessionsFile });
  } finally {
    await restore(appsFile, previousApps);
    await restore(versionsFile, previousVersions);
    await restore(sessionsFile, previousSessions);
  }
}

async function readJson(response: Response): Promise<JsonResponse> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return { status: response.status, body, text };
}

async function getList(appId: string): Promise<JsonResponse> {
  return readJson(
    await listGet(new Request(`http://localhost/api/apps/${appId}/config-versions`), {
      params: Promise.resolve({ appId }),
    })
  );
}

async function getDetail(appId: string, versionId: string): Promise<JsonResponse> {
  return readJson(
    await detailGet(
      new Request(`http://localhost/api/apps/${appId}/config-versions/${versionId}`),
      { params: Promise.resolve({ appId, versionId }) }
    )
  );
}

function assertNoSnapshotBody(text: string, message: string): void {
  const markers = [
    APP_API_KEY,
    PUBLISHED_API_KEY,
    VERSION_API_KEY,
    VERSION_PUBLISHED_API_KEY,
    SESSION_PROMPT,
    OTHER_APP_PROMPT,
    APP_ROW_PROMPT,
    "Early prompt",
    "Tie prompt",
    "Published prompt",
    "Draft prompt",
    "Add fractions",
    "Subtract fractions",
    "systemPrompt",
    "builderState",
    "apiKey",
  ];
  for (const marker of markers) {
    assert(!text.includes(marker), `${message} hides ${marker}`);
  }
}

function publicVersion(version: StoredVersion) {
  return {
    id: version.id,
    appId: version.appId,
    kind: version.kind,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    sealedAt: version.sealedAt,
    name: version.name,
    provider: version.provider,
    model: version.model,
    variability: version.variability,
    systemPrompt: version.systemPrompt,
    assistedAuthoringMode: version.assistedAuthoringMode,
    builderState: version.builderState,
  };
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  installAuthMock();

  const tiedBuilder = builderState();
  const publishedBuilder = builderState({ learningObjective: "Subtract fractions" });
  const early = versionRecord({
    id: "edit-zzz",
    appId: "bot-1",
    name: "Early tutor",
    systemPrompt: "Early prompt",
    variability: null,
    assistedAuthoringMode: true,
    builderState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    sealedAt: "2026-01-02T00:00:00.000Z",
  });
  const tieLow = versionRecord({
    id: "edit-c",
    appId: "bot-1",
    name: "Tie tutor",
    systemPrompt: "Tie prompt",
    variability: null,
    assistedAuthoringMode: true,
    builderState: tiedBuilder,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    sealedAt: "2026-02-20T00:00:00.000Z",
  });
  const tieHigh = versionRecord({
    id: "edit-m",
    appId: "bot-1",
    name: "Tie tutor",
    provider: "google",
    systemPrompt: "Tie prompt",
    variability: null,
    assistedAuthoringMode: true,
    builderState: tiedBuilder,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    sealedAt: "2026-02-20T00:00:00.000Z",
  });
  const published = versionRecord({
    id: "edit-z",
    appId: "bot-1",
    name: "Published tutor",
    provider: "google",
    systemPrompt: "Published prompt",
    variability: 0.2,
    assistedAuthoringMode: false,
    builderState: publishedBuilder,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    sealedAt: "2026-04-01T00:00:00.000Z",
  });
  const draft = versionRecord({
    id: "edit-draft",
    appId: "bot-1",
    name: "Draft tutor",
    provider: "google",
    model: "gpt-4.1-mini",
    systemPrompt: "Draft prompt",
    variability: 0,
    assistedAuthoringMode: true,
    builderState: publishedBuilder,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    sealedAt: null,
  });
  const sessionCopy = versionRecord({
    id: "session-copy",
    appId: "bot-1",
    kind: "session",
    name: "Session copy",
    systemPrompt: SESSION_PROMPT,
    builderState: builderState({ learningObjective: "Session objective" }),
    createdAt: "2026-02-15T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    sealedAt: "2026-02-15T00:00:00.000Z",
  });
  const otherEdit = versionRecord({
    id: "other-edit",
    appId: "bot-other",
    name: "Other tutor",
    systemPrompt: OTHER_APP_PROMPT,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    sealedAt: null,
  });

  const bot = stubApp({
    id: "bot-1",
    ownerId: "owner-a",
    name: "Live tutor",
    apiKey: APP_API_KEY,
    publishedApiKey: PUBLISHED_API_KEY,
    systemPrompt: APP_ROW_PROMPT,
    publishedAt: "2026-04-01T00:00:00.000Z",
    publishedVersionId: "edit-z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
  });
  const otherBot = stubApp({
    id: "bot-other",
    ownerId: "owner-b",
    name: "Other live tutor",
    apiKey: "OTHER_APP_API_KEY",
    systemPrompt: OTHER_APP_PROMPT,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });

  const expectedList = {
    versions: [
      {
        id: "edit-z",
        createdAt: published.createdAt,
        updatedAt: published.updatedAt,
        isDraft: false,
        isPublished: true,
      },
      {
        id: "edit-draft",
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        isDraft: true,
        isPublished: false,
      },
      {
        id: "edit-c",
        createdAt: tieLow.createdAt,
        updatedAt: tieLow.updatedAt,
        isDraft: false,
        isPublished: false,
      },
      {
        id: "edit-m",
        createdAt: tieHigh.createdAt,
        updatedAt: tieHigh.updatedAt,
        isDraft: false,
        isPublished: false,
      },
      {
        id: "edit-zzz",
        createdAt: early.createdAt,
        updatedAt: early.updatedAt,
        isDraft: false,
        isPublished: false,
      },
    ],
  };

  const sessionsBody = JSON.stringify({
    sessions: [{ id: "sentinel-session-must-remain" }],
  });

  try {
    await withTempStore(
      [bot, otherBot],
      [early, tieLow, tieHigh, published, draft, sessionCopy, otherEdit],
      sessionsBody,
      async (files) => {
        const beforeApps = await fsPromises.readFile(files.apps, "utf-8");
        const beforeVersions = await fsPromises.readFile(files.versions, "utf-8");
        const beforeSessions = await fsPromises.readFile(files.sessions, "utf-8");

        const listRoute = await import("../../app/api/apps/[appId]/config-versions/route.ts");
        const detailRoute = await import(
          "../../app/api/apps/[appId]/config-versions/[versionId]/route.ts"
        );
        listGet = listRoute.GET;
        detailGet = detailRoute.GET;

        setSession(null);
        const signedOutList = await getList("bot-1");
        assertEqual(signedOutList.status, 401, "missing session list status");
        assertEqual(signedOutList.body, { error: "Unauthorized" }, "missing session list body");
        assertNoSnapshotBody(signedOutList.text, "missing session list");

        setSession({ user: {} });
        const namelessList = await getList("bot-1");
        assertEqual(namelessList.status, 401, "session without user id list status");
        assertEqual(
          namelessList.body,
          { error: "Unauthorized" },
          "session without user id list body"
        );

        setSession({ user: { id: "" } });
        const blankList = await getList("bot-1");
        assertEqual(blankList.status, 401, "blank user id list status");
        assertEqual(blankList.body, { error: "Unauthorized" }, "blank user id list body");

        setSession(null);
        const signedOutDetail = await getDetail("bot-1", "edit-z");
        assertEqual(signedOutDetail.status, 401, "missing session detail status");
        assertEqual(
          signedOutDetail.body,
          { error: "Unauthorized" },
          "missing session detail body"
        );
        assertNoSnapshotBody(signedOutDetail.text, "missing session detail");

        setSession({ user: { id: "owner-b" } });
        const strangerList = await getList("bot-1");
        assertEqual(strangerList.status, 404, "non-owner list status");
        assertEqual(strangerList.body, { error: "App not found" }, "non-owner list body");
        assertNoSnapshotBody(strangerList.text, "non-owner list");

        const strangerDetail = await getDetail("bot-1", "edit-z");
        assertEqual(strangerDetail.status, 404, "non-owner detail status");
        assertEqual(strangerDetail.body, { error: "App not found" }, "non-owner detail body");
        assertNoSnapshotBody(strangerDetail.text, "non-owner detail");

        const strangerSession = await getDetail("bot-1", "session-copy");
        assertEqual(strangerSession.status, 404, "non-owner session id status");
        assertEqual(
          strangerSession.body,
          { error: "App not found" },
          "non-owner session id does not reveal a version"
        );
        assertNoSnapshotBody(strangerSession.text, "non-owner session id");

        setSession({ user: { id: "owner-a" } });
        const missingApp = await getList("missing-bot");
        assertEqual(missingApp.status, 404, "missing app list status");
        assertEqual(missingApp.body, { error: "App not found" }, "missing app list body");

        const missingAppDetail = await getDetail("missing-bot", "edit-z");
        assertEqual(missingAppDetail.status, 404, "missing app detail status");
        assertEqual(
          missingAppDetail.body,
          { error: "App not found" },
          "missing app detail body"
        );

        const otherAppList = await getList("bot-other");
        assertEqual(otherAppList.status, 404, "other owner's app list status");
        assertEqual(otherAppList.body, { error: "App not found" }, "other owner's app list body");
        assert(!otherAppList.text.includes(OTHER_APP_PROMPT), "other app prompt stays hidden");

        const listed = await getList("bot-1");
        assertEqual(listed.status, 200, "owner list status");
        assertEqual(listed.body, expectedList, "owner list is edit versions newest-updated first");
        assert(
          !listed.text.includes("session-copy"),
          "the list omits the session copy id"
        );
        assert(!listed.text.includes(SESSION_PROMPT), "the list omits session copy text");
        assert(!listed.text.includes("Early prompt"), "the list omits prompt text");
        assert(!listed.text.includes("Tie prompt"), "the list omits tied prompt text");
        assert(!listed.text.includes("Published prompt"), "the list omits published prompt text");
        assert(!listed.text.includes("Draft prompt"), "the list omits draft prompt text");
        assert(!listed.text.includes("Add fractions"), "the list omits builder inputs");
        assert(!listed.text.includes("Subtract fractions"), "the list omits changed builder inputs");
        assert(!listed.text.includes("systemPrompt"), "the list omits prompt field names");
        assert(!listed.text.includes("builderState"), "the list omits builder field names");
        assert(!listed.text.includes(APP_API_KEY), "the list omits the app api key");
        assert(!listed.text.includes(PUBLISHED_API_KEY), "the list omits the published api key");
        assert(!listed.text.includes(VERSION_API_KEY), "the list omits version api keys");
        assert(
          !listed.text.includes(VERSION_PUBLISHED_API_KEY),
          "the list omits version published api keys"
        );
        assert(!listed.text.includes(APP_ROW_PROMPT), "the list omits the live app prompt");
        assert(!listed.text.includes("other-edit"), "the list omits another app's version");

        const earliest = await getDetail("bot-1", "edit-zzz");
        assertEqual(earliest.status, 200, "earliest version status");
        assertEqual(
          earliest.body,
          {
            version: publicVersion(early),
            previousVersionId: null,
            diff: [],
          },
          "the earliest edit version has no previous version"
        );
        assert(!earliest.text.includes(VERSION_API_KEY), "earliest detail omits apiKey");
        assert(
          !earliest.text.includes(VERSION_PUBLISHED_API_KEY),
          "earliest detail omits publishedApiKey"
        );

        const sameTimestamp = await getDetail("bot-1", "edit-z");
        assertEqual(sameTimestamp.status, 200, "published version status");
        assertEqual(
          sameTimestamp.body,
          {
            version: publicVersion(published),
            previousVersionId: "edit-m",
            diff: [
              { field: "name", earlier: "Tie tutor", later: "Published tutor" },
              { field: "systemPrompt", earlier: "Tie prompt", later: "Published prompt" },
              { field: "variability", earlier: "unset", later: "0.2" },
              { field: "assistedAuthoringMode", earlier: "on", later: "off" },
              {
                field: "builderState.learningObjective",
                earlier: "Add fractions",
                later: "Subtract fractions",
              },
            ],
          },
          "same createdAt uses the greatest smaller id and shows changed settings"
        );

        const tiePrevious = await getDetail("bot-1", "edit-m");
        assertEqual(tiePrevious.status, 200, "tied version status");
        assertEqual(
          tiePrevious.body,
          {
            version: publicVersion(tieHigh),
            previousVersionId: "edit-c",
            diff: [{ field: "provider", earlier: "openai", later: "google" }],
          },
          "an equal createdAt compares with the next smaller id"
        );

        const nextOlder = await getDetail("bot-1", "edit-c");
        assertEqual(nextOlder.status, 200, "lower tie version status");
        assertEqual(
          nextOlder.body,
          {
            version: publicVersion(tieLow),
            previousVersionId: "edit-zzz",
            diff: [
              { field: "name", earlier: "Early tutor", later: "Tie tutor" },
              { field: "systemPrompt", earlier: "Early prompt", later: "Tie prompt" },
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
          },
          "when no smaller id shares createdAt, the next-older createdAt is previous"
        );

        const openedDraft = await getDetail("bot-1", "edit-draft");
        assertEqual(openedDraft.status, 200, "draft detail status");
        assertEqual(
          openedDraft.body,
          {
            version: publicVersion(draft),
            previousVersionId: "edit-z",
            diff: [
              { field: "name", earlier: "Published tutor", later: "Draft tutor" },
              {
                field: "systemPrompt",
                earlier: "Published prompt",
                later: "Draft prompt",
              },
              { field: "model", earlier: "gpt-4.1", later: "gpt-4.1-mini" },
              { field: "variability", earlier: "0.2", later: "0" },
              { field: "assistedAuthoringMode", earlier: "off", later: "on" },
            ],
          },
          "opening the draft compares it with the latest earlier edit, skipping the session copy"
        );

        const afterInspect = await getList("bot-1");
        assertEqual(
          afterInspect.body,
          expectedList,
          "opening a version does not make it the draft or change publish state"
        );

        const sessionDetail = await getDetail("bot-1", "session-copy");
        assertEqual(sessionDetail.status, 404, "session copy status");
        assertEqual(
          sessionDetail.body,
          { error: "Version not found" },
          "session copy body"
        );
        assertNoSnapshotBody(sessionDetail.text, "session copy");

        const unknownDetail = await getDetail("bot-1", "no-such-version");
        assertEqual(unknownDetail.status, 404, "unknown version status");
        assertEqual(
          unknownDetail.body,
          { error: "Version not found" },
          "unknown version body"
        );
        assertNoSnapshotBody(unknownDetail.text, "unknown version");

        const foreignDetail = await getDetail("bot-1", "other-edit");
        assertEqual(foreignDetail.status, 404, "another app's version status");
        assertEqual(
          foreignDetail.body,
          { error: "Version not found" },
          "another app's version body"
        );
        assert(!foreignDetail.text.includes(OTHER_APP_PROMPT), "another app snapshot stays hidden");

        assertEqual(
          await fsPromises.readFile(files.apps, "utf-8"),
          beforeApps,
          "version reads do not change the app row"
        );
        assertEqual(
          await fsPromises.readFile(files.versions, "utf-8"),
          beforeVersions,
          "version reads do not write versions"
        );
        assertEqual(
          await fsPromises.readFile(files.sessions, "utf-8"),
          beforeSessions,
          "version reads do not change chat sessions"
        );
      }
    );
  } finally {
    await fsPromises.rm(AUTH_MOCK_PATH, { force: true });
  }

  if (failures > 0) {
    console.error(`\nroutes.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("routes.selftest: all assertions passed");
}

main().catch((err) => {
  console.error("routes.selftest crashed:", err);
  process.exit(1);
});
