/**
 * Task-local verification for the editor test-chat recording helper (task 2.3).
 * Proves session-per-test-case identity, switch/reset identity, editor-test surface,
 * and ChatRecordingPayload shape without loading AssistantPanel.
 */
import { createEditorTestRecording } from "../components/editor/editor-test-recording";
import type { ChatRecordingPayload } from "../lib/chat-session-store/record-chat-turn";

type Check = { name: string; run: () => void };

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function assertMatchesChatRecordingPayload(
  payload: unknown
): ChatRecordingPayload {
  assert(payload !== null && typeof payload === "object", "payload is object");
  const record = payload as Record<string, unknown>;
  assert(
    typeof record.sessionId === "string" && record.sessionId.trim().length > 0,
    "sessionId is a non-empty string"
  );
  assert(
    record.surface === "public" || record.surface === "editor-test",
    "surface is a SessionSurface"
  );
  if (record.ownerSharing !== undefined) {
    assert(
      typeof record.ownerSharing === "boolean",
      "ownerSharing is boolean when present"
    );
  }
  if (record.messageTimes !== undefined) {
    assert(
      Array.isArray(record.messageTimes) &&
        record.messageTimes.every((item) => typeof item === "string"),
      "messageTimes is string[] when present"
    );
  }
  const contract: ChatRecordingPayload = {
    sessionId: record.sessionId as string,
    surface: record.surface as ChatRecordingPayload["surface"],
  };
  if (typeof record.ownerSharing === "boolean") {
    contract.ownerSharing = record.ownerSharing;
  }
  if (Array.isArray(record.messageTimes)) {
    contract.messageTimes = record.messageTimes as string[];
  }
  return contract;
}

function main() {
  const welcome = { role: "assistant" as const, content: "Welcome" };
  const firstUser = { role: "user" as const, content: "Hello" };
  const firstReply = { role: "assistant" as const, content: "Hi there" };
  const secondUser = { role: "user" as const, content: "Follow up" };
  const caseA = "test-case-a";
  const caseB = "test-case-b";
  const tryChat = "try-chat-case";

  const checks: Check[] = [
    {
      name: "same case reuses sessionId across turns",
      run: () => {
        const recording = createEditorTestRecording();
        const turn1 = recording.buildPayload(caseA, [welcome, firstUser]);
        const turn2 = recording.buildPayload(caseA, [
          welcome,
          firstUser,
          firstReply,
          secondUser,
        ]);
        assert(isUuid(turn1.sessionId), "sessionId is a UUID");
        assertEqual(turn2.sessionId, turn1.sessionId, "sessionId reused");
      },
    },
    {
      name: "switching cases yields a different sessionId",
      run: () => {
        const recording = createEditorTestRecording();
        const caseAPayload = recording.buildPayload(caseA, [welcome, firstUser]);
        const caseBPayload = recording.buildPayload(caseB, [welcome, firstUser]);
        assert(
          caseAPayload.sessionId !== caseBPayload.sessionId,
          "switch case creates a distinct session"
        );
        assert(isUuid(caseBPayload.sessionId), "switched sessionId is a UUID");
      },
    },
    {
      name: "switching back to a case reuses that case's sessionId",
      run: () => {
        const recording = createEditorTestRecording();
        const first = recording.buildPayload(caseA, [welcome, firstUser]);
        recording.buildPayload(caseB, [welcome]);
        const back = recording.buildPayload(caseA, [
          welcome,
          firstUser,
          firstReply,
        ]);
        assertEqual(back.sessionId, first.sessionId, "return to case reuses id");
      },
    },
    {
      name: "resetting a case yields a new sessionId",
      run: () => {
        const recording = createEditorTestRecording();
        const before = recording.buildPayload(caseA, [welcome, firstUser]);
        recording.resetCase(caseA);
        const after = recording.buildPayload(caseA, [welcome, firstUser]);
        assert(before.sessionId !== after.sessionId, "reset creates a new id");
        assert(isUuid(after.sessionId), "reset sessionId is a UUID");
      },
    },
    {
      name: "resetting one case does not change another case's session",
      run: () => {
        const recording = createEditorTestRecording();
        const caseAPayload = recording.buildPayload(caseA, [welcome]);
        const caseBPayload = recording.buildPayload(caseB, [welcome]);
        recording.resetCase(caseA);
        const caseBAfter = recording.buildPayload(caseB, [welcome, firstUser]);
        assertEqual(
          caseBAfter.sessionId,
          caseBPayload.sessionId,
          "other case session unchanged"
        );
        const caseAAfter = recording.buildPayload(caseA, [welcome]);
        assert(
          caseAAfter.sessionId !== caseAPayload.sessionId,
          "reset case has a new id"
        );
      },
    },
    {
      name: "try-chat is treated as a case with the same session rules",
      run: () => {
        const recording = createEditorTestRecording();
        const turn1 = recording.buildPayload(tryChat, [welcome, firstUser]);
        const turn2 = recording.buildPayload(tryChat, [
          welcome,
          firstUser,
          firstReply,
        ]);
        assertEqual(turn2.sessionId, turn1.sessionId, "try-chat reuses session");
        recording.resetCase(tryChat);
        const afterReset = recording.buildPayload(tryChat, [welcome]);
        assert(
          afterReset.sessionId !== turn1.sessionId,
          "try-chat reset starts a new session"
        );
      },
    },
    {
      name: "surface is editor-test",
      run: () => {
        const payload = createEditorTestRecording().buildPayload(caseA, [
          welcome,
          firstUser,
        ]);
        assertEqual(payload.surface, "editor-test", "surface");
      },
    },
    {
      name: "helper payload shape matches ChatRecordingPayload",
      run: () => {
        const payload = createEditorTestRecording().buildPayload(caseA, [
          welcome,
          firstUser,
        ]);
        const contract = assertMatchesChatRecordingPayload(payload);
        assertEqual(contract.sessionId, payload.sessionId, "sessionId");
        assertEqual(contract.surface, "editor-test", "surface");
        const typed: ChatRecordingPayload = payload;
        assertEqual(typed.surface, payload.surface, "assignable surface");
      },
    },
    {
      name: "messageTimes length matches messages on every turn",
      run: () => {
        const recording = createEditorTestRecording();
        const turn1Messages = [welcome, firstUser];
        const turn2Messages = [welcome, firstUser, firstReply, secondUser];
        const turn1 = recording.buildPayload(caseA, turn1Messages);
        const turn2 = recording.buildPayload(caseA, turn2Messages);
        assert(Array.isArray(turn1.messageTimes), "turn 1 has messageTimes");
        assert(Array.isArray(turn2.messageTimes), "turn 2 has messageTimes");
        assertEqual(
          turn1.messageTimes?.length,
          turn1Messages.length,
          "turn 1 messageTimes length"
        );
        assertEqual(
          turn2.messageTimes?.length,
          turn2Messages.length,
          "turn 2 messageTimes length"
        );
      },
    },
    {
      name: "reset also clears remembered message times for that case",
      run: () => {
        let clock = 0;
        const recording = createEditorTestRecording({
          now: () => `2026-08-24T21:00:0${clock++}.000Z`,
        });
        const before = recording.buildPayload(caseA, [welcome, firstUser]);
        recording.resetCase(caseA);
        const after = recording.buildPayload(caseA, [welcome, firstUser]);
        assert(
          after.messageTimes?.[0] !== before.messageTimes?.[0],
          "reset assigns fresh timestamps"
        );
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      check.run();
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

main();
