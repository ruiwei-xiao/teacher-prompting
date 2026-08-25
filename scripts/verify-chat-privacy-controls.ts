/**
 * Task-local verification for public-chat privacy controls (task 4).
 * Covers the opt-out client helper, sticky-off, failure revert, live
 * ownerSharing on later recording payloads, and source wiring.
 *
 * Run: npx tsx scripts/verify-chat-privacy-controls.ts
 */
import fs from "fs/promises";
import path from "path";
import { createPublicChatRecording } from "../components/public/chat-recording";

type Check = { name: string; run: () => void | Promise<void> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}: expected ${expectedJson}, received ${actualJson}`
    );
  }
}

const welcome = { role: "assistant" as const, content: "Welcome" };
const firstUser = { role: "user" as const, content: "Hello" };
const firstReply = { role: "assistant" as const, content: "Hi there" };
const secondUser = { role: "user" as const, content: "Follow up" };

async function loadSharingHelpers() {
  return import("../components/public/chat-sharing");
}

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
}

async function main() {
  const checks: Check[] = [
    {
      name: "ownerSharing defaults to true",
      run: () => {
        const payload = createPublicChatRecording().buildPayload([
          welcome,
          firstUser,
        ]);
        assertEqual(payload.ownerSharing, true, "ownerSharing");
      },
    },
    {
      name: "setOwnerSharing makes later payloads send ownerSharing false",
      run: () => {
        const recording = createPublicChatRecording();
        const turn1 = recording.buildPayload([welcome, firstUser]);
        assertEqual(turn1.ownerSharing, true, "default sharing");
        assert(
          typeof recording.setOwnerSharing === "function",
          "setOwnerSharing is a live setter"
        );
        recording.setOwnerSharing(false);
        const turn2 = recording.buildPayload([
          welcome,
          firstUser,
          firstReply,
          secondUser,
        ]);
        assertEqual(turn2.ownerSharing, false, "live sharing after opt-out");
        assertEqual(turn2.sessionId, turn1.sessionId, "session continues");
      },
    },
    {
      name: "buildPayload option can pass live ownerSharing false",
      run: () => {
        const recording = createPublicChatRecording();
        const turn1 = recording.buildPayload([welcome, firstUser]);
        const turn2 = recording.buildPayload(
          [welcome, firstUser, firstReply, secondUser],
          { ownerSharing: false }
        );
        assertEqual(turn1.ownerSharing, true, "first turn default");
        assertEqual(turn2.ownerSharing, false, "second turn option");
        assertEqual(turn2.sessionId, turn1.sessionId, "session continues");
      },
    },
    {
      name: "buildPayload still works after opt-out (send continues)",
      run: () => {
        const recording = createPublicChatRecording();
        recording.buildPayload([welcome, firstUser]);
        recording.setOwnerSharing(false);
        const after = recording.buildPayload([
          welcome,
          firstUser,
          firstReply,
          secondUser,
        ]);
        assert(
          typeof after.sessionId === "string" && after.sessionId.length > 0,
          "sessionId remains after opt-out"
        );
        assertEqual(after.surface, "public", "surface");
        assertEqual(after.ownerSharing, false, "opted out");
        assertEqual(after.messageTimes.length, 4, "messageTimes length");
      },
    },
    {
      name: "buildSharingRequest returns POST path for the session",
      run: async () => {
        const { buildSharingRequest } = await loadSharingHelpers();
        const request = buildSharingRequest("sess-abc");
        assertEqual(request.method, "POST", "method");
        assertEqual(
          request.url,
          "/api/sessions/sess-abc/sharing",
          "url"
        );
      },
    },
    {
      name: "applyOptOutResult ok → sharing off, no error",
      run: async () => {
        const { applyOptOutResult } = await loadSharingHelpers();
        const next = applyOptOutResult({ ok: true });
        assertEqual(next.sharing, false, "sharing");
        assertEqual(next.error, null, "error");
      },
    },
    {
      name: "applyOptOutResult error reverts sharing to on with a brief error",
      run: async () => {
        const { applyOptOutResult } = await loadSharingHelpers();
        const next = applyOptOutResult({ ok: false });
        assertEqual(next.sharing, true, "sharing reverts to on");
        assert(
          typeof next.error === "string" && next.error.trim().length > 0,
          "brief error is present"
        );
        const withError = applyOptOutResult({ error: "nope" });
        assertEqual(withError.sharing, true, "error shape reverts to on");
        assert(
          typeof withError.error === "string" && withError.error.trim().length > 0,
          "error shape has a brief error"
        );
      },
    },
    {
      name: "404 before first message is local opt-out success; later payload ownerSharing false",
      run: async () => {
        const { optOutResultFromHttpStatus, applySharingTransition } =
          await loadSharingHelpers();
        assert(
          typeof optOutResultFromHttpStatus === "function",
          "optOutResultFromHttpStatus is exported"
        );
        const recording = createPublicChatRecording();
        const before = recording.buildPayload([welcome]);
        assertEqual(before.ownerSharing, true, "sharing still on before opt-out");

        // No session row yet: POST /sharing → 404. Treat as local success.
        const interpreted = optOutResultFromHttpStatus(404);
        const next = applySharingTransition(true, interpreted);
        assertEqual(next.sharing, false, "sharing stays off after 404");
        assertEqual(next.error, null, "no error toast on 404");
        if (next.sharing === false) {
          recording.setOwnerSharing(false);
        }

        const sticky = applySharingTransition(next.sharing, { ok: false });
        assertEqual(sticky.sharing, false, "sticky off after local 404 success");
        assertEqual(sticky.error, null, "no error once already off");

        const later = recording.buildPayload([welcome, firstUser]);
        assertEqual(later.ownerSharing, false, "next buildPayload ownerSharing false");
        assertEqual(later.sessionId, before.sessionId, "same conversation session");
      },
    },
    {
      name: "existing-session non-OK still reverts to on",
      run: async () => {
        const {
          optOutResultFromHttpStatus,
          applySharingTransition,
          applyOptOutResult,
        } = await loadSharingHelpers();

        const forbidden = applySharingTransition(
          true,
          optOutResultFromHttpStatus(403)
        );
        assertEqual(forbidden.sharing, true, "403 reverts to on");
        assert(
          typeof forbidden.error === "string" && forbidden.error.trim().length > 0,
          "403 shows a brief error"
        );

        const server = applySharingTransition(
          true,
          optOutResultFromHttpStatus(500)
        );
        assertEqual(server.sharing, true, "500 reverts to on");
        assert(
          typeof server.error === "string" && server.error.trim().length > 0,
          "500 shows a brief error"
        );

        const network = applyOptOutResult({ ok: false });
        assertEqual(network.sharing, true, "network failure reverts to on");
        assert(
          typeof network.error === "string" && network.error.trim().length > 0,
          "network failure shows a brief error"
        );
      },
    },
    {
      name: "sticky-off: once sharing is false it stays false",
      run: async () => {
        const { applySharingTransition, isSharingToggleDisabled } =
          await loadSharingHelpers();
        const afterSuccess = applySharingTransition(true, { ok: true });
        assertEqual(afterSuccess.sharing, false, "opt-out succeeds");
        const laterFailure = applySharingTransition(false, { ok: false });
        assertEqual(laterFailure.sharing, false, "sticky off ignores later failure");
        assertEqual(laterFailure.error, null, "no error once already off");
        assertEqual(isSharingToggleDisabled(true), false, "on is still toggleable");
        assertEqual(isSharingToggleDisabled(false), true, "off is sticky/disabled");
      },
    },
    {
      name: "ChatPrivacyControls notice, toggle contract, and accessibility",
      run: async () => {
        const source = await readSource(
          "components/public/ChatPrivacyControls.tsx"
        );
        assert(
          source.includes("Your conversation may be viewed by this bot's creator"),
          "notice copy"
        );
        assert(
          source.includes("sharing: boolean") && source.includes("onTurnOff"),
          "props { sharing, onTurnOff }"
        );
        assert(
          source.includes("aria-checked") || source.includes("aria-pressed"),
          "toggle exposes aria-checked or aria-pressed"
        );
        assert(
          /disabled=\{!sharing\}|disabled=\{sharing === false\}|disabled=\{sharing === !1\}/.test(
            source
          ) || source.includes("disabled={!sharing}"),
          "toggle is disabled after opt-out"
        );
        assert(
          source.includes("role=\"switch\"") ||
            source.includes("role='switch'") ||
            source.includes('role={"switch"}'),
          "toggle is a switch or equivalent button"
        );
      },
    },
    {
      name: "PublishedChatbot wires ChatPrivacyControls and live ownerSharing",
      run: async () => {
        const source = await readSource(
          "components/public/PublishedChatbot.tsx"
        );
        assert(
          source.includes("ChatPrivacyControls"),
          "renders ChatPrivacyControls"
        );
        assert(
          source.includes("buildSharingRequest") ||
            source.includes("/api/sessions/") && source.includes("/sharing"),
          "opt-out calls the sharing endpoint"
        );
        assert(
          source.includes("optOutResultFromHttpStatus"),
          "HTTP status mapping treats 404 as local opt-out success"
        );
        assert(
          source.includes("applyOptOutResult") ||
            source.includes("setSharing(true)"),
          "endpoint failure reverts sharing"
        );
        assert(
          source.includes("setOwnerSharing(false)") ||
            source.includes("ownerSharing: sharing") ||
            source.includes("ownerSharing:sharing"),
          "later recording payloads use live sharing (ownerSharing false after opt-out)"
        );
        assert(
          source.includes("recording.buildPayload"),
          "send still attaches recording after opt-out"
        );
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`ok  ${check.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`fail ${check.name}: ${message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log(`\n${checks.length} check(s) passed`);
}

void main();
