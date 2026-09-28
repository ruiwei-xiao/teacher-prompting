/**
 * Self-test: public chat uses the published snapshot and editor test uses the draft.
 * Run: npx tsx lib/chat/resolve-chat-config.selftest.ts
 */
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server";
import type { AppConfig } from "../app-store/types";
import type { ConfigVersionRecord } from "../app-config-versions/types";

delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_URL_NON_POOLING;
delete process.env.POSTGRES_PRISMA_URL;

const PUB_DRAFT_KEY = "sentinel-pub-draft-key";
const PUB_PUBLISHED_KEY = "sentinel-pub-published-key";
const REPAIR_DRAFT_KEY = "sentinel-repair-draft-key";
const NOKEY_DRAFT_KEY = "sentinel-nokey-draft-key";
const EDITOR_DRAFT_KEY = "sentinel-editor-draft-key";
const EDITOR_PUBLISHED_KEY = "sentinel-editor-published-key";
const SEALED_DRAFT_KEY = "sentinel-sealed-draft-key";
const REPUBLISH_KEY_A = "sentinel-republish-key-a";
const REPUBLISH_KEY_B = "sentinel-republish-key-b";
const DANGLING_PUBLISHED_KEY = "sentinel-dangling-published-key";
const DANGLING_DRAFT_KEY = "sentinel-dangling-draft-key";

const PUBLISHED_PROMPT = "published-system-prompt";
const DRAFT_PROMPT = "draft-system-prompt";
const EDITOR_TYPED_PROMPT = "editor-typed-system-prompt";
const REPAIR_EARLIEST_PROMPT = "repair-earliest-prompt";
const REPAIR_NEWER_PROMPT = "repair-newer-draft-prompt";
const REPAIR_APP_PROMPT = "repair-app-row-prompt";
const REPUBLISH_PROMPT_A = "republish-prompt-a";
const REPUBLISH_PROMPT_B = "republish-prompt-b";
const DANGLING_DRAFT_PROMPT = "dangling-draft-prompt";

const MOCK_DIR = path.join(process.cwd(), ".data", "chat-resolution-mocks");

type RouteSession = { user?: { id?: string; name?: string | null } } | null;

type SendCall = {
  provider?: string;
  model?: string;
  apiKey?: string;
  system?: string;
  variability?: number;
};

type JsonResponse = {
  status: number;
  body: unknown;
  text: string;
};

let failures = 0;
let chatPost: (req: NextRequest) => Promise<Response>;

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

function same(actual: unknown, expected: unknown, message: string): void {
  assert(actual === expected, message);
}

function setSession(session: RouteSession): void {
  (globalThis as { __chatResolutionSession?: RouteSession }).__chatResolutionSession =
    session;
}

function sendCalls(): SendCall[] {
  return (
    (globalThis as { __chatResolutionSendCalls?: SendCall[] }).__chatResolutionSendCalls ??
    []
  );
}

function resetSendCalls(): void {
  (globalThis as { __chatResolutionSendCalls?: SendCall[] }).__chatResolutionSendCalls =
    [];
}

function installMocks(): void {
  fs.mkdirSync(MOCK_DIR, { recursive: true });
  const authPath = path.join(MOCK_DIR, "auth.mjs");
  const providersPath = path.join(MOCK_DIR, "providers.mjs");
  const headersPath = path.join(MOCK_DIR, "headers.mjs");
  fs.writeFileSync(
    authPath,
    `export async function auth() {
  const session = globalThis.__chatResolutionSession;
  return session === undefined ? null : session;
}
`,
    "utf-8"
  );
  fs.writeFileSync(
    providersPath,
    `export async function sendChat(args) {
  const calls = globalThis.__chatResolutionSendCalls ?? [];
  calls.push(args);
  globalThis.__chatResolutionSendCalls = calls;
  return "mocked-reply";
}
`,
    "utf-8"
  );
  fs.writeFileSync(
    headersPath,
    `export async function cookies() {
  return { get() { return undefined; }, set() {} };
}
export async function headers() {
  return { get() { return null; } };
}
`,
    "utf-8"
  );
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@/auth") {
        return { url: pathToFileURL(authPath).href, shortCircuit: true };
      }
      if (specifier === "@/lib/ai/providers") {
        return { url: pathToFileURL(providersPath).href, shortCircuit: true };
      }
      if (specifier === "next/headers") {
        return { url: pathToFileURL(headersPath).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

function stubApp(overrides: Partial<AppConfig> & Pick<AppConfig, "id">): AppConfig {
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? "owner-1",
    name: overrides.name ?? `App ${overrides.id}`,
    description: overrides.description ?? "A tutoring bot",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    apiKey: overrides.apiKey ?? "unset-key",
    variability: overrides.variability,
    systemPrompt: overrides.systemPrompt,
    publicSlug: overrides.publicSlug,
    publishedAt: overrides.publishedAt,
    publishedVersionId: overrides.publishedVersionId,
    publishedApiKey: overrides.publishedApiKey,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function versionRecord(
  overrides: Partial<ConfigVersionRecord> & Pick<ConfigVersionRecord, "id" | "appId">
): ConfigVersionRecord {
  return {
    name: overrides.name ?? "Version name",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4.1",
    variability: overrides.variability === undefined ? null : overrides.variability,
    systemPrompt: overrides.systemPrompt ?? "version prompt",
    assistedAuthoringMode: overrides.assistedAuthoringMode ?? false,
    builderState: overrides.builderState === undefined ? null : overrides.builderState,
    id: overrides.id,
    appId: overrides.appId,
    kind: overrides.kind ?? "edit",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    sealedAt: overrides.sealedAt === undefined ? null : overrides.sealedAt,
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
    return;
  }
  await fsPromises.mkdir(path.dirname(file), { recursive: true });
  await fsPromises.writeFile(file, previous, "utf-8");
}

async function withTempStore(
  apps: AppConfig[],
  versions: ConfigVersionRecord[],
  fn: (files: { apps: string }) => Promise<void>
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
  await fsPromises.writeFile(
    sessionsFile,
    JSON.stringify({ sessions: [] }, null, 2),
    "utf-8"
  );
  try {
    await fn({ apps: appsFile });
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

async function postChat(body: unknown): Promise<JsonResponse> {
  const request = new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(await chatPost(request));
}

function assertNoSecrets(text: string, message: string): void {
  const secrets = [
    PUB_DRAFT_KEY,
    PUB_PUBLISHED_KEY,
    REPAIR_DRAFT_KEY,
    NOKEY_DRAFT_KEY,
    EDITOR_DRAFT_KEY,
    EDITOR_PUBLISHED_KEY,
    SEALED_DRAFT_KEY,
    REPUBLISH_KEY_A,
    REPUBLISH_KEY_B,
    DANGLING_PUBLISHED_KEY,
    DANGLING_DRAFT_KEY,
  ];
  for (const secret of secrets) {
    assert(!text.includes(secret), `${message} does not include an API key`);
  }
  assert(!text.includes("\"apiKey\""), `${message} omits apiKey`);
  assert(!text.includes("publishedApiKey"), `${message} omits publishedApiKey`);
}

function recording(sessionId: string, surface: "public" | "editor-test"): Record<string, unknown> {
  return {
    sessionId,
    surface,
    ownerSharing: true,
    configVersionId: "forged-client-version-id",
  };
}

async function main(): Promise<void> {
  installMocks();
  resetSendCalls();
  setSession(null);

  const publishedAt = "2026-02-01T00:00:00.000Z";
  const apps = [
    stubApp({
      id: "pub-bot",
      publicSlug: "pub-slug",
      name: "Draft Tutor",
      provider: "google",
      model: "draft-model",
      apiKey: PUB_DRAFT_KEY,
      variability: 91,
      systemPrompt: DRAFT_PROMPT,
      publishedAt,
      publishedVersionId: "pub-edit",
      publishedApiKey: PUB_PUBLISHED_KEY,
    }),
    stubApp({
      id: "repair-bot",
      name: "Repair Draft Name",
      provider: "google",
      model: "repair-draft-model",
      apiKey: REPAIR_DRAFT_KEY,
      variability: 77,
      systemPrompt: REPAIR_APP_PROMPT,
      publishedAt,
      publishedVersionId: null,
      publishedApiKey: null,
    }),
    stubApp({
      id: "dangling-bot",
      name: "Dangling Draft Name",
      provider: "google",
      model: "dangling-draft-model",
      apiKey: DANGLING_DRAFT_KEY,
      variability: 44,
      systemPrompt: DANGLING_DRAFT_PROMPT,
      publishedAt,
      publishedVersionId: "missing-published-version",
      publishedApiKey: DANGLING_PUBLISHED_KEY,
    }),
    stubApp({
      id: "nokey-bot",
      name: "No Key Tutor",
      provider: "openai",
      model: "nokey-draft-model",
      apiKey: NOKEY_DRAFT_KEY,
      variability: 10,
      systemPrompt: "nokey-draft-prompt",
      publishedAt,
      publishedVersionId: "nokey-edit",
      publishedApiKey: null,
    }),
    stubApp({
      id: "unpublished-bot",
      name: "Unpublished Tutor",
      provider: "openai",
      model: "unpublished-model",
      apiKey: "sentinel-unpublished-key",
      systemPrompt: "unpublished-prompt",
      publishedVersionId: null,
      publishedApiKey: null,
    }),
    stubApp({
      id: "editor-bot",
      name: "Editor Draft Name",
      provider: "google",
      model: "draft-model",
      apiKey: EDITOR_DRAFT_KEY,
      variability: 33,
      systemPrompt: DRAFT_PROMPT,
      publishedAt,
      publishedVersionId: "editor-published",
      publishedApiKey: EDITOR_PUBLISHED_KEY,
    }),
    stubApp({
      id: "editor-sealed-bot",
      name: "Sealed Draft Name",
      provider: "anthropic",
      model: "sealed-draft-model",
      apiKey: SEALED_DRAFT_KEY,
      variability: 18,
      systemPrompt: "sealed-draft-prompt",
      publishedVersionId: null,
      publishedApiKey: null,
    }),
    stubApp({
      id: "republish-bot",
      name: "Republish Draft Name",
      provider: "google",
      model: "republish-draft-model",
      apiKey: "sentinel-republish-draft-key",
      variability: 70,
      systemPrompt: "republish-draft-prompt",
      publishedAt,
      publishedVersionId: "re-a",
      publishedApiKey: REPUBLISH_KEY_A,
    }),
  ];
  const versions = [
    versionRecord({
      id: "pub-edit",
      appId: "pub-bot",
      name: "Published Tutor",
      provider: "anthropic",
      model: "published-model",
      variability: 12,
      systemPrompt: PUBLISHED_PROMPT,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      sealedAt: "2026-02-01T00:00:00.000Z",
    }),
    versionRecord({
      id: "pub-draft",
      appId: "pub-bot",
      name: "Draft Tutor",
      provider: "google",
      model: "draft-model",
      variability: 91,
      systemPrompt: DRAFT_PROMPT,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      sealedAt: null,
    }),
    versionRecord({
      id: "repair-early",
      appId: "repair-bot",
      name: "Repaired Tutor",
      provider: "anthropic",
      model: "repair-published-model",
      variability: 21,
      systemPrompt: REPAIR_EARLIEST_PROMPT,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sealedAt: "2026-01-02T00:00:00.000Z",
    }),
    versionRecord({
      id: "repair-draft",
      appId: "repair-bot",
      name: "Repair Draft Name",
      provider: "google",
      model: "repair-draft-model",
      variability: 50,
      systemPrompt: REPAIR_NEWER_PROMPT,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      sealedAt: null,
    }),
    versionRecord({
      id: "dangling-edit",
      appId: "dangling-bot",
      name: "Dangling Real Version",
      provider: "openai",
      model: "dangling-real-model",
      systemPrompt: "dangling-real-prompt",
      sealedAt: "2026-02-01T00:00:00.000Z",
    }),
    versionRecord({
      id: "nokey-edit",
      appId: "nokey-bot",
      name: "No Key Published",
      provider: "openai",
      model: "nokey-published-model",
      variability: 5,
      systemPrompt: "nokey-published-prompt",
      sealedAt: "2026-02-01T00:00:00.000Z",
    }),
    versionRecord({
      id: "unpub-edit",
      appId: "unpublished-bot",
      name: "Unpublished Tutor",
      systemPrompt: "unpublished-prompt",
      sealedAt: null,
    }),
    versionRecord({
      id: "editor-published",
      appId: "editor-bot",
      name: "Editor Published Name",
      provider: "anthropic",
      model: "editor-published-model",
      variability: 10,
      systemPrompt: PUBLISHED_PROMPT,
      createdAt: "2026-02-01T00:00:00.000Z",
      sealedAt: "2026-02-01T00:00:00.000Z",
    }),
    versionRecord({
      id: "editor-draft",
      appId: "editor-bot",
      name: "Editor Draft Name",
      provider: "google",
      model: "draft-model",
      variability: 33,
      systemPrompt: DRAFT_PROMPT,
      createdAt: "2026-03-01T00:00:00.000Z",
      sealedAt: null,
    }),
    versionRecord({
      id: "editor-sealed-edit",
      appId: "editor-sealed-bot",
      name: "Sealed Draft Name",
      provider: "anthropic",
      model: "sealed-draft-model",
      variability: 18,
      systemPrompt: "sealed-draft-prompt",
      sealedAt: "2026-02-01T00:00:00.000Z",
    }),
    versionRecord({
      id: "re-a",
      appId: "republish-bot",
      name: "Republish A",
      provider: "anthropic",
      model: "republish-model-a",
      variability: 11,
      systemPrompt: REPUBLISH_PROMPT_A,
      createdAt: "2026-02-01T00:00:00.000Z",
      sealedAt: "2026-02-01T00:00:00.000Z",
    }),
    versionRecord({
      id: "re-b",
      appId: "republish-bot",
      name: "Republish B",
      provider: "openai",
      model: "republish-model-b",
      variability: 64,
      systemPrompt: REPUBLISH_PROMPT_B,
      createdAt: "2026-05-01T00:00:00.000Z",
      sealedAt: "2026-05-01T00:00:00.000Z",
    }),
  ];

  await withTempStore(apps, versions, async ({ apps: appsFile }) => {
    const chatRoute = await import("../../app/api/chat/route");
    chatPost = chatRoute.POST;
    const { loadPublicChatPage } = await import("./resolve-chat-config");
    const { getAppById } = await import("../app-store/store");
    const { listConfigVersions } = await import("../app-config-versions/store");
    const { getSessionById } = await import("../chat-session-store/store");

    async function versionIds(appId: string): Promise<string[]> {
      const rows = await listConfigVersions(appId);
      return rows.map((version) => version.id).sort();
    }

    const pageSource = await fsPromises.readFile(
      path.join(process.cwd(), "app/chat/[appId]/page.tsx"),
      "utf-8"
    );
    assert(pageSource.includes("generateMetadata"), "public page sets the document title");
    assert(
      pageSource.includes("title: loaded.title"),
      "document title uses the resolved published name"
    );
    assert(
      pageSource.includes("appName={loaded.title}"),
      "visible title uses the resolved published name"
    );
    assert(!pageSource.includes("app.name"), "public page does not title from the draft name");

    resetSendCalls();
    setSession(null);
    const publishedReply = await postChat({
      appId: "pub-bot",
      messages: [{ role: "user", content: "Hello" }],
      recording: recording("sess-public", "public"),
    });
    const publishedCall = sendCalls()[0];
    same(publishedReply.status, 200, "published public chat succeeds");
    same(publishedCall?.provider, "anthropic", "public reply uses the published provider");
    same(publishedCall?.model, "published-model", "public reply uses the published model");
    same(publishedCall?.variability, 12, "public reply uses the published variability");
    same(publishedCall?.system, PUBLISHED_PROMPT, "public reply uses the published prompt");
    same(publishedCall?.apiKey, PUB_PUBLISHED_KEY, "public reply uses the published API key");
    assert(
      publishedCall?.system !== DRAFT_PROMPT,
      "public reply does not use the draft prompt"
    );
    assert(publishedCall?.apiKey !== PUB_DRAFT_KEY, "public reply does not use the draft API key");
    const publishedBody = publishedReply.body as { provider?: string; model?: string; reply?: string };
    same(publishedBody.provider, "anthropic", "public response reports the published provider");
    same(publishedBody.model, "published-model", "public response reports the published model");
    assertNoSecrets(publishedReply.text, "public response");
    assert(!publishedReply.text.includes(PUBLISHED_PROMPT), "public response does not echo the prompt");
    const publicSession = await getSessionById("sess-public");
    same(publicSession?.appName, "Published Tutor", "public session records the published name");
    same(
      publicSession?.configVersionId,
      "pub-edit",
      "new public session records the published version id"
    );
    assert(
      publicSession?.configVersionId !== "forged-client-version-id",
      "client recording cannot set configVersionId"
    );

    const publishedPage = await loadPublicChatPage("pub-bot");
    same(publishedPage.status, "ok", "published page resolves");
    if (publishedPage.status === "ok") {
      same(publishedPage.title, "Published Tutor", "public page title uses the published name");
      same(
        publishedPage.systemPrompt,
        PUBLISHED_PROMPT,
        "public page visualization prompt is the published prompt"
      );
      assertNoSecrets(JSON.stringify(publishedPage), "public page model");
    }
    const sluggedPage = await loadPublicChatPage("pub-slug");
    if (sluggedPage.status === "ok") {
      same(sluggedPage.title, "Published Tutor", "slug page title uses the published name");
      same(sluggedPage.appId, "pub-bot", "slug page uses the bot id");
    } else {
      assert(false, "published slug resolves");
    }

    const repairIdsBefore = await versionIds("repair-bot");
    resetSendCalls();
    const repairReply = await postChat({
      appId: "repair-bot",
      messages: [{ role: "user", content: "Hello" }],
      recording: recording("sess-repair", "public"),
    });
    const repairCall = sendCalls()[0];
    same(repairReply.status, 200, "empty pointer still serves public chat");
    same(repairCall?.provider, "anthropic", "empty pointer uses the repaired provider");
    same(repairCall?.model, "repair-published-model", "empty pointer uses the repaired model");
    same(repairCall?.variability, 21, "empty pointer uses the repaired variability");
    same(repairCall?.system, REPAIR_EARLIEST_PROMPT, "empty pointer uses the repaired prompt");
    assert(
      repairCall?.system !== REPAIR_APP_PROMPT && repairCall?.system !== REPAIR_NEWER_PROMPT,
      "empty pointer does not use the draft prompt"
    );
    const repairedApp = await getAppById("repair-bot");
    same(repairedApp?.publishedVersionId, "repair-early", "empty pointer stores the repair id");
    same(
      repairCall?.apiKey,
      repairedApp?.publishedApiKey,
      "empty pointer uses the published API key written by repair"
    );
    assertEqual(
      await versionIds("repair-bot"),
      repairIdsBefore,
      "chat resolution does not insert a version for an empty pointer"
    );
    const repairSession = await getSessionById("sess-repair");
    same(repairSession?.configVersionId, "repair-early", "repaired public session records that id");
    same(repairSession?.appName, "Repaired Tutor", "repaired public session records the repaired name");
    const repairPage = await loadPublicChatPage("repair-bot");
    if (repairPage.status === "ok") {
      same(repairPage.title, "Repaired Tutor", "repaired page title uses the repair result");
    } else {
      assert(false, "repaired page resolves");
    }

    const danglingIdsBefore = await versionIds("dangling-bot");
    const danglingAppBefore = await getAppById("dangling-bot");
    resetSendCalls();
    const danglingReply = await postChat({
      appId: "dangling-bot",
      messages: [{ role: "user", content: "Hello" }],
      recording: recording("sess-dangling", "public"),
    });
    same(danglingReply.status, 500, "dangling pointer returns 500");
    assertEqual(
      danglingReply.body,
      { error: "Published configuration is unavailable." },
      "dangling pointer returns the English error"
    );
    same(sendCalls().length, 0, "dangling pointer does not call the provider");
    assert(
      !danglingReply.text.includes(DANGLING_DRAFT_PROMPT),
      "dangling pointer does not use the draft"
    );
    assertNoSecrets(danglingReply.text, "dangling response");
    assertEqual(await versionIds("dangling-bot"), danglingIdsBefore, "dangling pointer inserts nothing");
    const danglingAppAfter = await getAppById("dangling-bot");
    same(
      danglingAppAfter?.publishedVersionId,
      danglingAppBefore?.publishedVersionId,
      "dangling pointer stays in place"
    );
    same(await getSessionById("sess-dangling"), null, "dangling pointer does not record a session");
    const danglingPage = await loadPublicChatPage("dangling-bot");
    same(danglingPage.status, "unavailable", "dangling page does not render the draft");

    resetSendCalls();
    const nokeyReply = await postChat({
      appId: "nokey-bot",
      messages: [{ role: "user", content: "Hello" }],
    });
    same(nokeyReply.status, 500, "missing published key is an error");
    assertEqual(
      nokeyReply.body,
      { error: 'Missing API key for app "nokey-bot"' },
      "missing published key does not fall back to the draft key"
    );
    same(sendCalls().length, 0, "missing published key does not call the provider");
    assertNoSecrets(nokeyReply.text, "missing published key response");

    resetSendCalls();
    const unpublishedReply = await postChat({
      appId: "unpublished-bot",
      messages: [{ role: "user", content: "Hello" }],
    });
    same(unpublishedReply.status, 401, "unpublished bot stays unavailable on public chat");
    same(sendCalls().length, 0, "unpublished bot does not call the provider");
    const unpublishedPage = await loadPublicChatPage("unpublished-bot");
    same(unpublishedPage.status, "not-found", "unpublished page stays unavailable");

    setSession({ user: { id: "owner-1", name: "Owner" } });
    const editorIdsBefore = await versionIds("editor-bot");
    resetSendCalls();
    const editorReply = await postChat({
      appId: "editor-bot",
      system: EDITOR_TYPED_PROMPT,
      messages: [{ role: "user", content: "Try this" }],
      recording: recording("sess-editor", "editor-test"),
    });
    const editorCall = sendCalls()[0];
    same(editorReply.status, 200, "editor test succeeds");
    same(editorCall?.system, EDITOR_TYPED_PROMPT, "editor test uses the supplied system prompt");
    same(editorCall?.provider, "google", "editor test uses the draft provider");
    same(editorCall?.model, "draft-model", "editor test uses the draft model");
    same(editorCall?.variability, 33, "editor test uses the draft variability");
    same(editorCall?.apiKey, EDITOR_DRAFT_KEY, "editor test uses the draft API key");
    assert(editorCall?.apiKey !== EDITOR_PUBLISHED_KEY, "editor test does not use the published API key");
    assert(editorCall?.system !== PUBLISHED_PROMPT, "editor test does not use the published prompt");
    assertNoSecrets(editorReply.text, "editor response");
    const editorVersions = await listConfigVersions("editor-bot");
    const editorCreated = editorVersions.filter((version) => !editorIdsBefore.includes(version.id));
    same(editorCreated.length, 1, "unsealed editor test inserts one session copy");
    same(editorCreated[0]?.kind, "session", "pinned editor row is a session copy");
    assert(editorCreated[0]?.sealedAt !== null, "pinned editor row is sealed");
    const editorDraft = editorVersions.find((version) => version.id === "editor-draft");
    same(editorDraft?.sealedAt, null, "editor test does not seal the draft");
    const editorSession = await getSessionById("sess-editor");
    same(
      editorSession?.configVersionId,
      editorCreated[0]?.id,
      "new editor-test session records the pinned version id"
    );
    assert(
      editorSession?.configVersionId !== "forged-client-version-id",
      "editor recording cannot set configVersionId"
    );
    const editorPointer = await getAppById("editor-bot", "owner-1");
    same(editorPointer?.publishedVersionId, "editor-published", "editor test does not publish");

    resetSendCalls();
    const editorAgain = await postChat({
      appId: "editor-bot",
      system: EDITOR_TYPED_PROMPT,
      messages: [{ role: "user", content: "Second try" }],
      recording: recording("sess-editor", "editor-test"),
    });
    same(editorAgain.status, 200, "later editor turn succeeds");
    same(
      (await versionIds("editor-bot")).length,
      editorIdsBefore.length + 1,
      "a later editor turn does not pin another copy"
    );
    const editorDraftAfter = (await listConfigVersions("editor-bot")).find(
      (version) => version.id === "editor-draft"
    );
    same(editorDraftAfter?.sealedAt, null, "a later editor turn leaves the draft unsealed");
    same(
      (await getSessionById("sess-editor"))?.configVersionId,
      editorCreated[0]?.id,
      "a later editor turn keeps the pinned version id"
    );

    const sealedIdsBefore = await versionIds("editor-sealed-bot");
    resetSendCalls();
    const sealedReply = await postChat({
      appId: "editor-sealed-bot",
      system: "sealed-editor-prompt",
      messages: [{ role: "user", content: "Sealed try" }],
      recording: recording("sess-editor-sealed", "editor-test"),
    });
    const sealedCall = sendCalls()[0];
    same(sealedReply.status, 200, "sealed editor test succeeds");
    same(sealedCall?.system, "sealed-editor-prompt", "sealed editor test uses the supplied prompt");
    same(sealedCall?.provider, "anthropic", "sealed editor test uses the draft provider");
    same(sealedCall?.model, "sealed-draft-model", "sealed editor test uses the draft model");
    same(sealedCall?.variability, 18, "sealed editor test uses the draft variability");
    same(sealedCall?.apiKey, SEALED_DRAFT_KEY, "sealed editor test uses the draft API key");
    assertEqual(
      await versionIds("editor-sealed-bot"),
      sealedIdsBefore,
      "a sealed draft pin does not insert a version"
    );
    same(
      (await getSessionById("sess-editor-sealed"))?.configVersionId,
      "editor-sealed-edit",
      "a sealed draft records that same version id"
    );

    setSession(null);
    resetSendCalls();
    const firstRepublish = await postChat({
      appId: "republish-bot",
      messages: [{ role: "user", content: "Still open" }],
      recording: recording("sess-republish", "public"),
    });
    const firstRepublishCall = sendCalls()[0];
    same(firstRepublish.status, 200, "open public chat starts on the published version");
    same(firstRepublishCall?.system, REPUBLISH_PROMPT_A, "open chat starts on the published prompt");
    same(firstRepublishCall?.provider, "anthropic", "open chat starts on the published provider");
    same(firstRepublishCall?.model, "republish-model-a", "open chat starts on the published model");
    same(firstRepublishCall?.variability, 11, "open chat starts on the published variability");
    same(firstRepublishCall?.apiKey, REPUBLISH_KEY_A, "open chat starts on the published API key");
    same(
      (await getSessionById("sess-republish"))?.configVersionId,
      "re-a",
      "open chat records the version it started on"
    );

    const storedApps = JSON.parse(await fsPromises.readFile(appsFile, "utf-8")) as AppConfig[];
    const republished = storedApps.map((app) =>
      app.id === "republish-bot"
        ? { ...app, publishedVersionId: "re-b", publishedApiKey: REPUBLISH_KEY_B }
        : app
    );
    await fsPromises.writeFile(appsFile, JSON.stringify(republished, null, 2), "utf-8");
    resetSendCalls();
    const nextRepublish = await postChat({
      appId: "republish-bot",
      messages: [{ role: "user", content: "Still open" }],
      recording: recording("sess-republish", "public"),
    });
    const nextCall = sendCalls()[0];
    same(nextRepublish.status, 200, "republish still answers the open chat");
    same(nextCall?.system, REPUBLISH_PROMPT_B, "the next reply uses the newly published prompt");
    same(nextCall?.provider, "openai", "the next reply uses the newly published provider");
    same(nextCall?.model, "republish-model-b", "the next reply uses the newly published model");
    same(nextCall?.variability, 64, "the next reply uses the newly published variability");
    same(nextCall?.apiKey, REPUBLISH_KEY_B, "the next reply uses the newly published API key");
    assertNoSecrets(nextRepublish.text, "republished response");
    const republishSession = await getSessionById("sess-republish");
    same(
      republishSession?.configVersionId,
      "re-a",
      "republish leaves the session's starting version unchanged"
    );
    same(republishSession?.appName, "Republish A", "republish leaves the recorded starting name");
  });

  if (failures > 0) {
    console.error(`\nresolve-chat-config.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("resolve-chat-config.selftest: all assertions passed");
}

main().catch((error: unknown) => {
  console.error("resolve-chat-config.selftest crashed:", error);
  process.exit(1);
});
