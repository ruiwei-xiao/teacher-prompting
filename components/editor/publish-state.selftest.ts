/**
 * Editor publish chrome derived from version ids.
 *
 * Run: npx tsx components/editor/publish-state.selftest.ts
 */

import {
  adoptOwnerVersionPointers,
  applyFailedOwnerPatch,
  applySuccessfulOwnerPatch,
  deriveEditorPublishChrome,
  planEditorPublishAttempt,
  readOwnerAppRecord,
  readResponseError,
  UNPUBLISHED_CHANGES_NOTICE,
  PUBLISHED_STATUS_LABEL,
} from "./publish-state";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("Test 1: published ids that differ show the unpublished-changes notice and Republish");
{
  const chrome = deriveEditorPublishChrome({
    latestVersionId: "draft-2",
    publishedVersionId: "published-1",
  });
  assertEqual(chrome.notice, UNPUBLISHED_CHANGES_NOTICE, "notice copy");
  assertEqual(chrome.notice, "You have unpublished changes.", "exact notice");
  assertEqual(chrome.actionLabel, "Republish", "action label");
  assertEqual(chrome.statusLabel, null, "no Published status while drafts differ");

  const missingLatest = deriveEditorPublishChrome({
    latestVersionId: null,
    publishedVersionId: "published-1",
  });
  assertEqual(missingLatest.actionLabel, "Republish", "a published id without a latest id still republishes");
  assertEqual(missingLatest.notice, "You have unpublished changes.", "missing latest still explains unpublished changes");
}

console.log("Test 2: matching ids show Published and neither Publish nor Republish");
{
  const chrome = deriveEditorPublishChrome({
    latestVersionId: "published-1",
    publishedVersionId: "published-1",
  });
  assertEqual(chrome.statusLabel, PUBLISHED_STATUS_LABEL, "status copy");
  assertEqual(chrome.statusLabel, "Published", "exact status");
  assertEqual(chrome.actionLabel, null, "no action when ids match");
  assertEqual(chrome.notice, null, "no unpublished notice when ids match");
}

console.log("Test 3: a missing published id keeps Publish and hides Republish");
{
  const chrome = deriveEditorPublishChrome({
    latestVersionId: "draft-1",
    publishedVersionId: null,
  });
  assertEqual(chrome.actionLabel, "Publish", "first-publish action");
  assertEqual(chrome.notice, null, "no unpublished notice before first publish");
  assertEqual(chrome.statusLabel, null, "no Published status before first publish");

  const emptyPublished = deriveEditorPublishChrome({
    latestVersionId: "draft-1",
    publishedVersionId: "",
  });
  assertEqual(emptyPublished.actionLabel, "Publish", "empty published id is never published");
  assertEqual(emptyPublished.notice, null, "empty published id has no republish notice");

  const neither = deriveEditorPublishChrome({
    latestVersionId: null,
    publishedVersionId: null,
  });
  assertEqual(neither.actionLabel, "Publish", "missing ids keep Publish");
  assertEqual(neither.statusLabel, null, "missing ids are not Published");
}

console.log("Test 4: a failed patch keeps pointers, prompt, and dirty state and shows the response error");
{
  const before = {
    latestVersionId: "draft-2",
    publishedVersionId: "published-1",
    storedPrompt: "unsaved tutor prompt",
    dirty: true,
    error: null,
  };
  const error = readResponseError(
    { error: "Failed to update app settings", apiKey: "sk-secret", publishedApiKey: "sk-published" },
    "Failed to publish app"
  );
  assertEqual(error, "Failed to update app settings", "response error");
  assert(!error.includes("sk-secret"), "error text must not include an API key");

  const next = applyFailedOwnerPatch(before, error);
  assertEqual(next.latestVersionId, before.latestVersionId, "failed patch keeps latestVersionId");
  assertEqual(next.publishedVersionId, before.publishedVersionId, "failed patch keeps publishedVersionId");
  assertEqual(next.storedPrompt, before.storedPrompt, "failed patch keeps stored prompt");
  assertEqual(next.dirty, true, "failed patch keeps dirty editor state");
  assertEqual(next.error, "Failed to update app settings", "failed patch shows response error");
  assert(!JSON.stringify(next).includes("sk-secret"), "failed snapshot must not store an API key");

  const chrome = deriveEditorPublishChrome(next);
  assertEqual(chrome.actionLabel, "Republish", "failed republish stays on Republish");
  assertEqual(chrome.notice, "You have unpublished changes.", "failed republish keeps the notice");

  const reloaded = adoptOwnerVersionPointers(next, {
    latestVersionId: "draft-2",
    publishedVersionId: "published-1",
    apiKey: "sk-secret",
  });
  assertEqual(reloaded.error, next.error, "a later read keeps the failed-save error");
  assertEqual(reloaded.storedPrompt, next.storedPrompt, "a later read keeps the unsaved prompt");
  assertEqual(reloaded.dirty, true, "a later read keeps dirty editor state");
  assertEqual(reloaded.publishedVersionId, "published-1", "a later read keeps the published id");
  assert(!JSON.stringify(reloaded).includes("sk-secret"), "a later read must not store an API key");
}

console.log("Test 5: a successful patch copies version ids before any reload and does not leak keys");
{
  const before = {
    latestVersionId: "published-1",
    publishedVersionId: "published-1",
    storedPrompt: "new draft text",
    dirty: true,
    error: "previous error",
  };
  const recorded = readOwnerAppRecord({
    app: {
      latestVersionId: "draft-2",
      publishedVersionId: "published-1",
      publishedAt: "2026-09-28T00:00:00.000Z",
      publicSlug: "bot",
      apiKey: "sk-secret",
      publishedApiKey: "sk-published",
    },
  });
  assert(recorded !== null, "owner app record is readable");
  if (!recorded) throw new Error("expected an owner app record");
  assertEqual(recorded.latestVersionId, "draft-2", "owner record keeps latestVersionId");
  assertEqual(recorded.publishedVersionId, "published-1", "owner record keeps publishedVersionId");
  assert(!JSON.stringify(recorded).includes("sk-secret"), "owner record drops draft API key");
  assert(!JSON.stringify(recorded).includes("sk-published"), "owner record drops published API key");

  const next = applySuccessfulOwnerPatch(before, {
    ...recorded,
    apiKey: "sk-secret",
    publishedApiKey: "sk-published",
  });
  assertEqual(next.latestVersionId, "draft-2", "success stores response latestVersionId");
  assertEqual(next.publishedVersionId, "published-1", "success stores response publishedVersionId");
  assertEqual(next.storedPrompt, before.storedPrompt, "success leaves the editor prompt in place");
  assertEqual(next.dirty, true, "success does not clear dirty state on its own");
  assertEqual(next.error, null, "success clears the previous error");
  assert(!("apiKey" in next), "success snapshot has no apiKey");
  assert(!("publishedApiKey" in next), "success snapshot has no publishedApiKey");
  assert(!JSON.stringify(next).includes("sk-secret"), "success snapshot must not store an API key");

  const chrome = deriveEditorPublishChrome(next);
  assertEqual(chrome.notice, "You have unpublished changes.", "saved draft that is not published shows the notice");
  assertEqual(chrome.actionLabel, "Republish", "saved draft that is not published offers Republish");

  const synced = applySuccessfulOwnerPatch(next, {
    latestVersionId: "draft-2",
    publishedVersionId: "draft-2",
  });
  const syncedChrome = deriveEditorPublishChrome(synced);
  assertEqual(syncedChrome.statusLabel, "Published", "matching ids after publish show Published");
  assertEqual(syncedChrome.actionLabel, null, "matching ids hide Publish and Republish");
  assertEqual(synced.storedPrompt, before.storedPrompt, "publish success leaves the editor prompt in place");
}

console.log("Test 6: Publish and Republish share the assisted-authoring gate and the same patch body");
{
  const blocked = planEditorPublishAttempt({
    assistedAuthoringMode: true,
    testCaseStatus: { totalCount: 0, passedCount: 0, allPassed: false },
    systemPrompt: "keep this prompt",
  });
  assert(blocked.blocked, "mode ON with no tests blocks publish and republish");
  if (!blocked.blocked) throw new Error("expected a block");
  assertEqual(
    blocked.error,
    "Add and pass at least one test case before publishing.",
    "blocked publish explains the gate in English"
  );

  const partial = planEditorPublishAttempt({
    assistedAuthoringMode: true,
    testCaseStatus: { totalCount: 3, passedCount: 1, allPassed: false },
    systemPrompt: "keep this prompt",
  });
  assert(partial.blocked, "mode ON with failing tests blocks republish");
  if (!partial.blocked) throw new Error("expected a partial block");
  assertEqual(
    partial.error,
    "Mark all test cases as pass before publishing. 1 of 3 passed so far.",
    "partial pass uses the existing English explanation"
  );

  const allowed = planEditorPublishAttempt({
    assistedAuthoringMode: false,
    testCaseStatus: { totalCount: 0, passedCount: 0, allPassed: false },
    systemPrompt: "prompt text",
  });
  assert(!allowed.blocked, "mode OFF allows publish and republish");
  if (allowed.blocked) throw new Error("expected an allowed plan");
  assertEqual(allowed.body.systemPrompt, "prompt text", "patch sends the editor prompt");
  assertEqual(allowed.body.publish, true, "patch publishes");
  assertEqual(
    Object.keys(allowed.body).sort().join(","),
    "publish,systemPrompt",
    "patch body stays systemPrompt and publish"
  );
}

console.log("✓ All editor publish-state tests passed");
