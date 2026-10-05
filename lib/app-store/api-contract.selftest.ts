/**
 * Self-test: HTTP API contract for assistedAuthoringMode (Task 1.3).
 * Tests the full flow: create default OFF, GET, PATCH with validation.
 *
 * Run: npx tsx lib/app-store/api-contract.selftest.ts
 */
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import type { AppConfig } from "@/lib/app-store/types";
import {
  createDefaultBotFields,
  validateAssistedAuthoringMode,
} from "./patch-validation";
import { resolveAssistedAuthoringMode } from "@/lib/assisted-authoring/resolve";

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

function stubApp(overrides: Partial<AppConfig> & Pick<AppConfig, "id">): AppConfig {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-a",
    name: overrides.name ?? `App ${overrides.id}`,
    description: overrides.description ?? "Test bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o",
    apiKey: overrides.apiKey ?? "test-key",
    variability: overrides.variability ?? 0.5,
    systemPrompt: overrides.systemPrompt ?? "You are helpful.",
    assistedAuthoringMode: overrides.assistedAuthoringMode,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
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

async function withTempApps(
  apps: AppConfig[],
  fn: () => Promise<void>
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
  try {
    await fn();
  } finally {
    await restore(appsFile, previousApps);
    await restore(versionsFile, previousVersions);
    await restore(sessionsFile, previousSessions);
  }
}

const OWNER_ID = "owner-route";
const OTHER_ID = "other-route";
const DRAFT_KEY = "SENTINEL_DRAFT_API_KEY";
const NEW_DRAFT_KEY = "SENTINEL_NEW_DRAFT_API_KEY";
const CREATE_KEY = "SENTINEL_CREATE_API_KEY";
const SESSION_PROMPT = "SENTINEL_SESSION_COPY_PROMPT";
const SECRET_PROMPT = "SECRET_PROMPT_SHOULD_NOT_LOG";
const SECRET_KEY = "SECRET_PUBLISH_KEY_SHOULD_NOT_LOG";
const AUTH_MOCK_PATH = path.join(process.cwd(), ".data", "app-settings-route-auth-mock.mjs");

type RouteSession = { user?: { id?: string } } | null;

type JsonResponse = {
  status: number;
  body: unknown;
  text: string;
};

type SettingsRoute = {
  GET: (
    req: Request,
    context: { params: Promise<{ appId: string }> }
  ) => Promise<Response>;
  PATCH: (
    req: Request,
    context: { params: Promise<{ appId: string }> }
  ) => Promise<Response>;
};

type CollectionRoute = {
  GET: () => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setRouteSession(session: RouteSession): void {
  (globalThis as { __appSettingsRouteSession?: RouteSession }).__appSettingsRouteSession =
    session;
}

function installAppSettingsAuthMock(): void {
  fs.mkdirSync(path.dirname(AUTH_MOCK_PATH), { recursive: true });
  fs.writeFileSync(
    AUTH_MOCK_PATH,
    `export async function auth() {
  const session = globalThis.__appSettingsRouteSession;
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

function appRecord(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || !isRecord(body.app)) return null;
  return body.app;
}

function assertNoApiKeys(
  text: string,
  record: Record<string, unknown>,
  secrets: readonly string[],
  message: string
): void {
  assert(
    !Object.prototype.hasOwnProperty.call(record, "apiKey"),
    `${message} omits apiKey`
  );
  assert(
    !Object.prototype.hasOwnProperty.call(record, "publishedApiKey"),
    `${message} omits publishedApiKey`
  );
  assert(!text.includes('"apiKey"'), `${message} JSON omits the apiKey field`);
  assert(
    !text.includes('"publishedApiKey"'),
    `${message} JSON omits the publishedApiKey field`
  );
  for (const secret of secrets) {
    assert(!text.includes(secret), `${message} omits ${secret}`);
  }
}

async function resetVersionFile(): Promise<void> {
  const versionsFile = path.join(process.cwd(), ".data", "app-config-versions.json");
  await fsPromises.writeFile(
    versionsFile,
    JSON.stringify({ versions: [] }, null, 2),
    "utf-8"
  );
}

async function runOwnerAppRouteChecks(): Promise<void> {
  installAppSettingsAuthMock();
  const { NextRequest } = await import("next/server");
  const settingsRoute = (await import(
    "../../app/api/apps/[appId]/route"
  )) as SettingsRoute;
  const collectionRoute = (await import("../../app/api/apps/route")) as CollectionRoute;
  const { createApp, getAppById, updateApp } = await import("./store");
  const { listConfigVersions } = await import("../app-config-versions/store");
  const appsFile = path.join(process.cwd(), ".data", "apps.json");
  const versionsFile = path.join(process.cwd(), ".data", "app-config-versions.json");

  async function getApp(appId: string): Promise<JsonResponse> {
    return readJson(
      await settingsRoute.GET(new Request(`http://localhost/api/apps/${appId}`), {
        params: Promise.resolve({ appId }),
      })
    );
  }

  async function patchApp(
    appId: string,
    body: Record<string, unknown>
  ): Promise<JsonResponse> {
    return readJson(
      await settingsRoute.PATCH(
        new NextRequest(`http://localhost/api/apps/${appId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ appId }) }
      )
    );
  }

  async function unsealedEditId(appId: string): Promise<string | null> {
    const versions = await listConfigVersions(appId);
    const unsealed = versions.filter(
      (version) => version.kind === "edit" && version.sealedAt === null
    );
    if (unsealed.length !== 1) return null;
    return unsealed[0]?.id ?? null;
  }

  console.log("Test 11: GET returns the unsealed edit id and a null published id");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    const created = await createApp(
      stubApp({
        id: "read-draft",
        ownerId: OWNER_ID,
        apiKey: DRAFT_KEY,
        systemPrompt: "Draft prompt",
      })
    );
    const draftId = await unsealedEditId(created.id);
    assert(typeof draftId === "string", "setup stores one unsealed edit version");
    const raw = JSON.parse(await fsPromises.readFile(versionsFile, "utf-8")) as {
      versions: Record<string, unknown>[];
    };
    raw.versions.push({
      id: "session-later",
      appId: created.id,
      kind: "session",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      sealedAt: "2099-01-01T00:00:00.000Z",
      name: "Session copy",
      provider: "openai",
      model: "gpt-4o",
      variability: null,
      systemPrompt: SESSION_PROMPT,
      assistedAuthoringMode: false,
      builderState: null,
    });
    await fsPromises.writeFile(versionsFile, JSON.stringify(raw, null, 2), "utf-8");

    const response = await getApp(created.id);
    assertEqual(response.status, 200, "owner GET is 200");
    const app = appRecord(response.body);
    assert(app !== null, "owner GET returns app");
    if (!app) return;
    assertEqual(app.latestVersionId, draftId, "GET latestVersionId is the unsealed edit");
    assertEqual(app.publishedVersionId, null, "GET publishedVersionId is null before publish");
    assert(!response.text.includes(SESSION_PROMPT), "GET omits the session copy prompt");
    assertNoApiKeys(response.text, app, [DRAFT_KEY], "GET draft");
  });

  console.log("Test 12: GET uses the published edit id when the draft is sealed");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    const created = await createApp(
      stubApp({
        id: "read-sealed",
        ownerId: OWNER_ID,
        apiKey: DRAFT_KEY,
        systemPrompt: "Published prompt",
      })
    );
    const published = await updateApp(
      created.id,
      { publishedAt: "2026-03-01T00:00:00.000Z", publicSlug: "read-sealed" },
      OWNER_ID
    );
    const publishedId = published?.publishedVersionId ?? null;
    assert(typeof publishedId === "string", "setup publish stores a pointer");
    assertEqual(await unsealedEditId(created.id), null, "publish seals the edit version");

    const response = await getApp(created.id);
    assertEqual(response.status, 200, "sealed GET is 200");
    const app = appRecord(response.body);
    assert(app !== null, "sealed GET returns app");
    if (!app) return;
    assertEqual(app.publishedVersionId, publishedId, "GET returns publishedVersionId");
    assertEqual(
      app.latestVersionId,
      publishedId,
      "latestVersionId is the published edit version when the draft is sealed"
    );
    assertNoApiKeys(response.text, app, [DRAFT_KEY], "GET sealed");
  });

  console.log("Test 13: PATCH save and a later GET return both version ids");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    const created = await createApp(
      stubApp({
        id: "save-draft",
        ownerId: OWNER_ID,
        apiKey: DRAFT_KEY,
        systemPrompt: "Original prompt",
      })
    );
    const published = await updateApp(
      created.id,
      { publishedAt: "2026-03-01T00:00:00.000Z", publicSlug: "save-draft" },
      OWNER_ID
    );
    const publishedId = published?.publishedVersionId ?? null;
    const rotated = await updateApp(
      created.id,
      { provider: "google", model: "gemini-test", apiKey: NEW_DRAFT_KEY },
      OWNER_ID
    );
    assertEqual(rotated?.publishedVersionId ?? null, publishedId, "a key change does not publish");
    assertEqual(rotated?.apiKey, NEW_DRAFT_KEY, "setup stores the new draft key");
    assertEqual(rotated?.publishedApiKey, DRAFT_KEY, "setup keeps the published key");

    const saved = await patchApp(created.id, { systemPrompt: "Saved draft prompt" });
    assertEqual(saved.status, 200, "owner save is 200");
    const savedApp = appRecord(saved.body);
    assert(savedApp !== null, "owner save returns app");
    const draftId = await unsealedEditId(created.id);
    if (savedApp) {
      assertEqual(savedApp.publishedVersionId, publishedId, "save returns publishedVersionId");
      assertEqual(savedApp.latestVersionId, draftId, "save returns the unsealed edit id");
      assert(
        savedApp.latestVersionId !== savedApp.publishedVersionId,
        "save shows the draft is not the published version"
      );
      assertNoApiKeys(saved.text, savedApp, [DRAFT_KEY, NEW_DRAFT_KEY], "PATCH save");
    }

    const loaded = await getApp(created.id);
    const loadedApp = appRecord(loaded.body);
    assert(loadedApp !== null, "GET after save returns app");
    if (loadedApp) {
      assertEqual(loadedApp.latestVersionId, draftId, "GET after save returns latestVersionId");
      assertEqual(
        loadedApp.publishedVersionId,
        publishedId,
        "GET after save returns publishedVersionId"
      );
      assertNoApiKeys(loaded.text, loadedApp, [DRAFT_KEY, NEW_DRAFT_KEY], "GET after save");
    }
  });

  console.log("Test 14: PATCH publish returns the published edit as both ids");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    const created = await createApp(
      stubApp({
        id: "publish-route",
        ownerId: OWNER_ID,
        apiKey: DRAFT_KEY,
        name: "Publish Route",
      })
    );
    const response = await patchApp(created.id, { publish: true });
    assertEqual(response.status, 200, "owner publish is 200");
    const app = appRecord(response.body);
    assert(app !== null, "owner publish returns app");
    const stored = await getAppById(created.id, OWNER_ID);
    if (!app) return;
    assertEqual(
      app.publishedVersionId,
      stored?.publishedVersionId ?? null,
      "publish response returns publishedVersionId"
    );
    assertEqual(
      app.latestVersionId,
      stored?.publishedVersionId ?? null,
      "publish response latestVersionId is the sealed edit"
    );
    assert(
      typeof app.latestVersionId === "string" && app.latestVersionId.length > 0,
      "publish response includes a latestVersionId"
    );
    assertNoApiKeys(response.text, app, [DRAFT_KEY], "PATCH publish");
  });

  console.log("Test 15: list and create responses omit both API keys");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    await createApp(
      stubApp({
        id: "listed-bot",
        ownerId: OWNER_ID,
        name: "Listed Bot",
        apiKey: DRAFT_KEY,
      })
    );
    await updateApp(
      "listed-bot",
      { publishedAt: "2026-03-01T00:00:00.000Z", publicSlug: "listed-bot" },
      OWNER_ID
    );
    const stored = await getAppById("listed-bot", OWNER_ID);
    assertEqual(stored?.publishedApiKey, DRAFT_KEY, "setup copies the published key");

    const listed = await readJson(await collectionRoute.GET());
    assertEqual(listed.status, 200, "owner list is 200");
    assert(isRecord(listed.body) && Array.isArray(listed.body.apps), "list returns apps");
    if (isRecord(listed.body) && Array.isArray(listed.body.apps)) {
      for (const item of listed.body.apps) {
        if (!isRecord(item)) continue;
        assertNoApiKeys(listed.text, item, [DRAFT_KEY], "GET list");
      }
    }

    const created = await readJson(
      await collectionRoute.POST(
        new NextRequest("http://localhost/api/apps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Posted Bot",
            description: "A new bot",
            genaiModel: "openai:gpt-4o",
            genaiApiKey: CREATE_KEY,
          }),
        })
      )
    );
    assertEqual(created.status, 200, "owner create is 200");
    const createdApp = appRecord(created.body);
    assert(createdApp !== null, "create returns app");
    if (!createdApp) return;
    assertEqual(createdApp.id, "posted-bot", "create returns the new app id");
    assertNoApiKeys(created.text, createdApp, [CREATE_KEY, DRAFT_KEY], "POST create");
  });

  console.log("Test 16: a non-owner publish matches a missing bot and leaves the pointer");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    const created = await createApp(
      stubApp({
        id: "owned-bot",
        ownerId: OWNER_ID,
        apiKey: DRAFT_KEY,
        systemPrompt: "Live prompt",
      })
    );
    const published = await updateApp(
      created.id,
      { publishedAt: "2026-03-01T00:00:00.000Z", publicSlug: "owned-bot" },
      OWNER_ID
    );
    await updateApp(created.id, { systemPrompt: "Unpublished draft" }, OWNER_ID);
    const pointer = published?.publishedVersionId ?? null;
    assert(typeof pointer === "string", "setup republish target has a pointer");
    const appsBefore = await fsPromises.readFile(appsFile, "utf-8");
    const versionsBefore = await fsPromises.readFile(versionsFile, "utf-8");

    setRouteSession({ user: { id: OTHER_ID } });
    const foreign = await patchApp(created.id, { publish: true, systemPrompt: "Stolen prompt" });
    const missing = await patchApp("missing-bot-route", { publish: true });
    assertEqual(foreign.status, 404, "non-owner publish is 404");
    assertEqual(missing.status, 404, "missing bot publish is 404");
    assertEqual(foreign.body, { error: "App not found" }, "non-owner publish error");
    assertEqual(missing.body, foreign.body, "non-owner publish matches the missing-bot response");
    assertEqual(
      await fsPromises.readFile(appsFile, "utf-8"),
      appsBefore,
      "non-owner publish does not write the app"
    );
    assertEqual(
      await fsPromises.readFile(versionsFile, "utf-8"),
      versionsBefore,
      "non-owner publish does not write versions"
    );
    const stored = await getAppById(created.id, OWNER_ID);
    assertEqual(stored?.publishedVersionId ?? null, pointer, "published pointer stays unchanged");
  });

  console.log("Test 17: a failed publish returns an English error and keeps the pointer");
  await withTempApps([], async () => {
    await resetVersionFile();
    setRouteSession({ user: { id: OWNER_ID } });
    const created = await createApp(
      stubApp({
        id: "publish-fail-route",
        ownerId: OWNER_ID,
        apiKey: DRAFT_KEY,
        systemPrompt: "Previous prompt",
      })
    );
    const published = await updateApp(
      created.id,
      { publishedAt: "2026-03-01T00:00:00.000Z", publicSlug: "publish-fail-route" },
      OWNER_ID
    );
    await updateApp(created.id, { systemPrompt: "Draft that must remain" }, OWNER_ID);
    const pointer = published?.publishedVersionId ?? null;
    const appsBefore = await fsPromises.readFile(appsFile, "utf-8");
    const versionsBefore = await fsPromises.readFile(versionsFile, "utf-8");
    const logged: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map((arg) => String(arg)).join(" "));
    };
    let response: JsonResponse | null = null;
    try {
      process.env.APP_PUBLISH_FAULT = "1";
      response = await patchApp(created.id, {
        publish: true,
        systemPrompt: SECRET_PROMPT,
        genaiApiKey: SECRET_KEY,
      });
      assertEqual(
        process.env.APP_PUBLISH_FAULT,
        undefined,
        "APP_PUBLISH_FAULT still fails the next publish"
      );
    } finally {
      console.error = originalError;
      delete process.env.APP_PUBLISH_FAULT;
    }
    assert(response !== null, "failed publish returns a response");
    if (!response) return;
    assertEqual(response.status, 500, "failed publish is 500");
    assertEqual(
      response.body,
      { error: "Failed to update app settings" },
      "failed publish returns an English error"
    );
    assertEqual(
      await fsPromises.readFile(appsFile, "utf-8"),
      appsBefore,
      "failed publish restores the app file"
    );
    assertEqual(
      await fsPromises.readFile(versionsFile, "utf-8"),
      versionsBefore,
      "failed publish restores the versions file"
    );
    const stored = await getAppById(created.id, OWNER_ID);
    assertEqual(stored?.publishedVersionId ?? null, pointer, "previous publishedVersionId remains");
    assertEqual(stored?.publishedApiKey, DRAFT_KEY, "previous published API key remains");
    assertEqual(stored?.systemPrompt, "Draft that must remain", "previous draft remains");
    const logText = logged.join("\n");
    assert(!logText.includes(SECRET_PROMPT), "failed publish log omits the prompt");
    assert(!logText.includes(SECRET_KEY), "failed publish log omits the API key");
    assert(!logText.includes(DRAFT_KEY), "failed publish log omits the published API key");
  });
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;

  const { createApp, getAppById, updateApp } = await import("./store");

  console.log(
    "Test 1: POST /api/apps creates bot with assistedAuthoringMode=false"
  );
  const defaults = createDefaultBotFields();
  assertEqual(
    defaults.assistedAuthoringMode,
    false,
    "createDefaultBotFields returns false"
  );

  const newBot = stubApp({
    id: "new-bot-via-post",
    name: "New Bot",
    assistedAuthoringMode: defaults.assistedAuthoringMode,
  });

  await withTempApps([], async () => {
    await createApp(newBot);
    const retrieved = await getAppById(newBot.id);

    assert(retrieved !== null, "bot created");
    assertEqual(
      retrieved?.assistedAuthoringMode,
      false,
      "POST create stores OFF (false)"
    );
    assertEqual(
      resolveAssistedAuthoringMode(retrieved!),
      false,
      "resolves to OFF"
    );
  });

  console.log("Test 2: GET /api/apps/[appId] returns assistedAuthoringMode");
  const botWithMode = stubApp({
    id: "bot-with-mode",
    name: "Bot With Mode",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botWithMode);
    const retrieved = await getAppById(botWithMode.id);

    assert(retrieved !== null, "bot exists");
    assert(
      "assistedAuthoringMode" in retrieved!,
      "GET response includes assistedAuthoringMode field"
    );
    assertEqual(
      retrieved?.assistedAuthoringMode,
      true,
      "GET returns stored true"
    );
  });

  console.log("Test 3: GET returns undefined for legacy bots (missing field)");
  const legacyBot = stubApp({
    id: "legacy-bot",
    name: "Legacy Bot",
    // assistedAuthoringMode intentionally omitted
  });

  await withTempApps([], async () => {
    await createApp(legacyBot);
    const retrieved = await getAppById(legacyBot.id);

    assert(retrieved !== null, "legacy bot exists");
    assertEqual(
      retrieved?.assistedAuthoringMode,
      undefined,
      "GET returns undefined for legacy bots (not coerced to false)"
    );
    assertEqual(
      resolveAssistedAuthoringMode(retrieved!),
      true,
      "legacy bots resolve to ON (true)"
    );
  });

  console.log(
    "Test 4: PATCH /api/apps/[appId] with assistedAuthoringMode=true round-trips"
  );
  const botToPatchOn = stubApp({
    id: "bot-patch-on",
    name: "Bot Patch On",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botToPatchOn);

    // Simulate PATCH validation
    const patchBody = { assistedAuthoringMode: true };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(validation.ok, "PATCH validation passes for true");

    const updated = await updateApp(botToPatchOn.id, {
      assistedAuthoringMode: validation.ok ? validation.value : undefined,
    });

    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      true,
      "PATCH true persists"
    );

    const retrieved = await getAppById(botToPatchOn.id);
    assertEqual(
      retrieved?.assistedAuthoringMode,
      true,
      "PATCH true round-trips on GET"
    );
  });

  console.log(
    "Test 5: PATCH /api/apps/[appId] with assistedAuthoringMode=false round-trips"
  );
  const botToPatchOff = stubApp({
    id: "bot-patch-off",
    name: "Bot Patch Off",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botToPatchOff);

    const patchBody = { assistedAuthoringMode: false };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(validation.ok, "PATCH validation passes for false");

    const updated = await updateApp(botToPatchOff.id, {
      assistedAuthoringMode: validation.ok ? validation.value : undefined,
    });

    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      false,
      "PATCH false persists"
    );

    const retrieved = await getAppById(botToPatchOff.id);
    assertEqual(
      retrieved?.assistedAuthoringMode,
      false,
      "PATCH false round-trips on GET"
    );
  });

  console.log(
    "Test 6: PATCH with invalid assistedAuthoringMode type returns 400"
  );
  const invalidBodies = [
    { assistedAuthoringMode: "true" },
    { assistedAuthoringMode: 1 },
    { assistedAuthoringMode: null },
    { assistedAuthoringMode: {} },
    { assistedAuthoringMode: [] },
    { assistedAuthoringMode: undefined }, // explicit undefined in body
  ];

  for (const body of invalidBodies) {
    const validation = validateAssistedAuthoringMode(body);
    assert(
      !validation.ok,
      `PATCH rejects ${JSON.stringify(body.assistedAuthoringMode)}`
    );
    if (!validation.ok) {
      assertEqual(validation.status, 400, "status is 400");
      assert(
        validation.error.includes("boolean"),
        "error mentions boolean"
      );
    }
  }

  console.log("Test 7: PATCH without assistedAuthoringMode leaves field unchanged");
  const botNoChange = stubApp({
    id: "bot-no-change",
    name: "Bot No Change",
    assistedAuthoringMode: true,
  });

  await withTempApps([], async () => {
    await createApp(botNoChange);

    const patchBody = { name: "Updated Name" };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(validation.ok, "validation passes when field absent");
    if (!validation.ok) {
      throw new Error("expected validation.ok");
    }
    assertEqual(validation.value, undefined, "value is undefined");

    const updated = await updateApp(botNoChange.id, { name: "Updated Name" });

    assert(updated !== null, "update succeeded");
    assertEqual(
      updated?.assistedAuthoringMode,
      true,
      "assistedAuthoringMode unchanged"
    );
  });

  console.log(
    "Test 8: PATCH rejects non-boolean without silently coercing"
  );
  const botNonBoolean = stubApp({
    id: "bot-non-boolean",
    name: "Bot Non Boolean",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botNonBoolean);

    // Try PATCH with string "true"
    const patchBody: Record<string, unknown> = { assistedAuthoringMode: "true" };
    const validation = validateAssistedAuthoringMode(patchBody);
    assert(!validation.ok, "validation fails for string 'true'");

    // Verify bot state unchanged
    const unchanged = await getAppById(botNonBoolean.id);
    assertEqual(
      unchanged?.assistedAuthoringMode,
      false,
      "bot state not coerced or changed"
    );
  });

  console.log("Test 9: Multiple PATCH round-trips preserve exact values");
  const botMultiPatch = stubApp({
    id: "bot-multi-patch",
    name: "Bot Multi Patch",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botMultiPatch);

    // false -> true
    await updateApp(botMultiPatch.id, { assistedAuthoringMode: true });
    let current = await getAppById(botMultiPatch.id);
    assertEqual(current?.assistedAuthoringMode, true, "first patch: false->true");

    // true -> false
    await updateApp(botMultiPatch.id, { assistedAuthoringMode: false });
    current = await getAppById(botMultiPatch.id);
    assertEqual(current?.assistedAuthoringMode, false, "second patch: true->false");

    // false -> true again
    await updateApp(botMultiPatch.id, { assistedAuthoringMode: true });
    current = await getAppById(botMultiPatch.id);
    assertEqual(current?.assistedAuthoringMode, true, "third patch: false->true");
  });

  console.log(
    "Test 10: Owner-scoped responses maintain assistedAuthoringMode visibility"
  );
  const botOwnerScoped = stubApp({
    id: "bot-owner-scoped",
    name: "Bot Owner Scoped",
    ownerId: "owner-123",
    assistedAuthoringMode: false,
  });

  await withTempApps([], async () => {
    await createApp(botOwnerScoped);

    // GET with ownerId
    const retrieved = await getAppById(botOwnerScoped.id, "owner-123");
    assert(retrieved !== null, "owner can retrieve bot");
    assertEqual(
      retrieved?.assistedAuthoringMode,
      false,
      "owner sees assistedAuthoringMode"
    );

    // GET without matching ownerId should not find bot (owner-scoped)
    const notFound = await getAppById(botOwnerScoped.id, "different-owner");
    assertEqual(notFound, null, "different owner cannot retrieve bot");
  });

  try {
    await runOwnerAppRouteChecks();
  } finally {
    await fsPromises.rm(AUTH_MOCK_PATH, { force: true });
  }

  if (failures > 0) {
    console.error(`\napi-contract.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\napi-contract.selftest: all assertions passed");
}

main().catch((err) => {
  console.error("api-contract.selftest crashed:", err);
  process.exit(1);
});
