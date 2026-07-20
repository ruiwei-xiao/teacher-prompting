/**
 * Self-test: Peer bot preview + duplicate UI helpers + wiring (Task 6.7).
 * Run: npx tsx lib/workspace-ui/peer-preview.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  canShowAuthoringEditControls,
  parsePeerBotDuplicateResponse,
  parsePeerBotSnapshotResponse,
  peerBotDuplicateApiHref,
  peerBotPreviewHref,
  peerBotSnapshotApiHref,
} from "./peer-preview";

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

async function main(): Promise<void> {
  // --- Routes (Req 4.7 peer inspect + duplicate) ---
  assertEqual(
    peerBotPreviewHref("ws_1", "bot_peer"),
    "/workspace/ws_1/bots/bot_peer",
    "peer preview page href"
  );
  assertEqual(
    peerBotSnapshotApiHref("ws_1", "bot_peer"),
    "/api/workspaces/ws_1/bots/bot_peer",
    "peer snapshot API href"
  );
  assertEqual(
    peerBotDuplicateApiHref("ws_1", "bot_peer"),
    "/api/workspaces/ws_1/bots/bot_peer/duplicate",
    "peer duplicate API href"
  );

  // --- Non-owner must not get authoring edit controls (Req 4.6) ---
  assertEqual(
    canShowAuthoringEditControls({
      viewerUserId: "viewer_1",
      ownerId: "author_1",
    }),
    false,
    "non-owner cannot see authoring edit controls"
  );
  assertEqual(
    canShowAuthoringEditControls({
      viewerUserId: "author_1",
      ownerId: "author_1",
    }),
    true,
    "owner may see authoring edit controls (not the peer-preview path)"
  );
  assertEqual(
    canShowAuthoringEditControls({
      viewerUserId: "viewer_1",
      ownerId: undefined,
    }),
    false,
    "missing ownerId is treated as non-editable for peer preview"
  );

  // --- Snapshot parse: read-only fields, never surface apiKey ---
  const snapshotOk = parsePeerBotSnapshotResponse(200, {
    app: {
      id: "bot_peer",
      name: "Peer Lesson Bot",
      description: "Shared in workspace",
      ownerId: "author_1",
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "You are a helpful tutor.",
      builderState: {
        learningObjective: "Practice fractions",
        learningObjectivePrompt: "",
        uploadedExerciseName: "",
        uploadedExerciseText: "",
        exercisePrompt: "",
        gradeLevel: "5",
        language: "en",
        learnerNotes: "",
        learnerProfilePrompt: "",
        selectedTemplate: "",
        templatePrompt: "",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });
  assert(snapshotOk.ok === true, "200 peer snapshot is ok");
  if (snapshotOk.ok) {
    assertEqual(snapshotOk.app.id, "bot_peer", "snapshot app id");
    assertEqual(snapshotOk.app.name, "Peer Lesson Bot", "snapshot app name");
    assertEqual(snapshotOk.app.ownerId, "author_1", "snapshot retains source owner");
    assert(
      !("apiKey" in snapshotOk.app) ||
        (snapshotOk.app as { apiKey?: unknown }).apiKey === undefined,
      "snapshot parse must not expose apiKey"
    );
    assert(
      typeof snapshotOk.app.systemPrompt === "string",
      "snapshot includes systemPrompt for inspect"
    );
  }

  const snapshotWithSecret = parsePeerBotSnapshotResponse(200, {
    app: {
      id: "bot_peer",
      name: "Peer Lesson Bot",
      ownerId: "author_1",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-secret-should-strip",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });
  assert(snapshotWithSecret.ok === true, "snapshot with secret field still parses");
  if (snapshotWithSecret.ok) {
    assert(
      !("apiKey" in snapshotWithSecret.app) ||
        (snapshotWithSecret.app as { apiKey?: unknown }).apiKey === undefined,
      "parser strips apiKey from snapshot app"
    );
  }

  const snapshotForbidden = parsePeerBotSnapshotResponse(403, {
    error: "Forbidden",
  });
  assert(snapshotForbidden.ok === false, "403 snapshot fails");

  const snapshotNotFound = parsePeerBotSnapshotResponse(404, {
    error: "Bot not found",
  });
  assert(snapshotNotFound.ok === false, "404 snapshot fails");

  const snapshotInvalid = parsePeerBotSnapshotResponse(200, { app: "nope" });
  assert(snapshotInvalid.ok === false, "invalid snapshot payload fails");

  // --- Duplicate parse: new bot under viewer; source ownership unchanged ---
  const duplicateOk = parsePeerBotDuplicateResponse(200, {
    app: {
      id: "peer-lesson-bot-copy",
      name: "Peer Lesson Bot Copy",
      ownerId: "viewer_1",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "",
      forkedFromProjectName: "Peer Lesson Bot",
      forkedFromAuthorName: "Author One",
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
  });
  assert(duplicateOk.ok === true, "200 duplicate is ok");
  if (duplicateOk.ok) {
    assertEqual(
      duplicateOk.app.ownerId,
      "viewer_1",
      "duplicated bot is owned by viewer"
    );
    assert(
      duplicateOk.app.id !== "bot_peer",
      "duplicate creates a new bot id (source unchanged)"
    );
    assertEqual(
      duplicateOk.app.forkedFromProjectName,
      "Peer Lesson Bot",
      "duplicate keeps source attribution name"
    );
  }

  const duplicateForbidden = parsePeerBotDuplicateResponse(403, {
    error: "Forbidden",
  });
  assert(duplicateForbidden.ok === false, "403 duplicate fails");

  const duplicateInvalid = parsePeerBotDuplicateResponse(200, { app: null });
  assert(duplicateInvalid.ok === false, "invalid duplicate payload fails");

  // --- UI wiring ---
  const helpersPath = path.join(
    process.cwd(),
    "lib/workspace-ui/peer-preview.ts"
  );
  const previewPath = path.join(
    process.cwd(),
    "components/workspace/PeerBotPreview.tsx"
  );
  const pagePath = path.join(
    process.cwd(),
    "app/workspace/[workspaceId]/bots/[appId]/page.tsx"
  );
  const gridPath = path.join(
    process.cwd(),
    "components/workspace/WorkspaceBotGrid.tsx"
  );

  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const previewSource = await fs.readFile(previewPath, "utf8").catch(() => "");
  const pageSource = await fs.readFile(pagePath, "utf8").catch(() => "");
  const gridSource = await fs.readFile(gridPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "lib/workspace-ui/peer-preview.ts exists");
  assert(
    previewSource.includes("PeerBotPreview"),
    "PeerBotPreview component exists"
  );
  assert(
    previewSource.includes("peerBotSnapshotApiHref") ||
      (previewSource.includes("/api/workspaces/") &&
        previewSource.includes("/bots/")),
    "preview loads peer snapshot API"
  );
  assert(
    previewSource.includes("peerBotDuplicateApiHref") ||
      previewSource.includes("/duplicate"),
    "preview calls duplicate API"
  );
  assert(
    previewSource.includes("fetch") || previewSource.includes("method"),
    "preview uses fetch for inspect/duplicate"
  );
  assert(
    previewSource.includes('method: "POST"') ||
      previewSource.includes("method: 'POST'") ||
      previewSource.includes('"POST"'),
    "preview POSTs duplicate"
  );
  assert(
    previewSource.includes("parsePeerBotSnapshotResponse") ||
      previewSource.includes("systemPrompt") ||
      previewSource.includes("read-only") ||
      previewSource.includes("Read-only") ||
      previewSource.includes("Inspect"),
    "preview presents inspect/read-only content"
  );
  assert(
    previewSource.toLowerCase().includes("duplicate"),
    "preview exposes Duplicate action"
  );
  assert(
    !previewSource.includes("method: \"PATCH\"") &&
      !previewSource.includes("method: 'PATCH'") &&
      !previewSource.includes("onSave") &&
      !previewSource.includes("savePrompt") &&
      !previewSource.includes("readOnly={false}") &&
      !previewSource.includes("/app/${appId}/editor") &&
      !previewSource.includes("`/app/${appId}/editor`"),
    "PeerBotPreview has no authoring edit controls for the source bot"
  );
  assert(
    previewSource.includes("/editor") ||
      previewSource.includes("MY_BOTS_HREF") ||
      previewSource.includes('href="/"'),
    "after duplicate, navigates to the viewer's owned bot or My bots"
  );
  assert(
    pageSource.includes("PeerBotPreview"),
    "workspace bots page renders PeerBotPreview"
  );
  assert(
    gridSource.includes("peerBotPreviewHref") ||
      (gridSource.includes("/workspace/") &&
        gridSource.includes("/bots/") &&
        (gridSource.includes("Inspect") || gridSource.includes("inspect"))),
    "bot grid wires peer inspect to preview route"
  );

  if (failures > 0) {
    console.error(`\npeer-preview.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("peer-preview.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("peer-preview.selftest crashed:", err);
  process.exit(1);
});
