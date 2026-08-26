/**
 * Task-local verification for the public chat recording payload builder (task 2.2).
 * Proves session identity reuse, reset/new-instance identity, public surface, and
 * messageTimes alignment without requiring a live browser.
 */
import { createPublicChatRecording } from "../components/public/chat-recording";

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

function main() {
  const welcome = { role: "assistant" as const, content: "Welcome" };
  const firstUser = { role: "user" as const, content: "Hello" };
  const firstReply = { role: "assistant" as const, content: "Hi there" };
  const secondUser = { role: "user" as const, content: "Follow up" };

  const checks: Check[] = [
    {
      name: "same sessionId is reused across turns",
      run: () => {
        const recording = createPublicChatRecording();
        const turn1 = recording.buildPayload([welcome, firstUser]);
        const turn2 = recording.buildPayload([
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
      name: "new builder instance yields a new session id",
      run: () => {
        const first = createPublicChatRecording().buildPayload([welcome]);
        const second = createPublicChatRecording().buildPayload([welcome]);
        assert(first.sessionId !== second.sessionId, "new instance has a new id");
      },
    },
    {
      name: "reset yields a new session id",
      run: () => {
        const recording = createPublicChatRecording();
        const before = recording.buildPayload([welcome, firstUser]);
        recording.reset();
        const after = recording.buildPayload([welcome, firstUser]);
        assert(before.sessionId !== after.sessionId, "reset creates a new id");
        assert(isUuid(after.sessionId), "reset sessionId is a UUID");
      },
    },
    {
      name: "surface is public",
      run: () => {
        const payload = createPublicChatRecording().buildPayload([
          welcome,
          firstUser,
        ]);
        assertEqual(payload.surface, "public", "surface");
      },
    },
    {
      name: "ownerSharing defaults to true until privacy controls exist",
      run: () => {
        const payload = createPublicChatRecording().buildPayload([
          welcome,
          firstUser,
        ]);
        assertEqual(payload.ownerSharing, true, "ownerSharing");
      },
    },
    {
      name: "messageTimes length matches messages on every turn",
      run: () => {
        const recording = createPublicChatRecording();
        const turn1Messages = [welcome, firstUser];
        const turn2Messages = [welcome, firstUser, firstReply, secondUser];
        const turn1 = recording.buildPayload(turn1Messages);
        const turn2 = recording.buildPayload(turn2Messages);
        assertEqual(
          turn1.messageTimes.length,
          turn1Messages.length,
          "turn 1 messageTimes length"
        );
        assertEqual(
          turn2.messageTimes.length,
          turn2Messages.length,
          "turn 2 messageTimes length"
        );
      },
    },
    {
      name: "messageTimes stay stable for earlier messages across turns",
      run: () => {
        let clock = 0;
        const recording = createPublicChatRecording({
          now: () => `2026-08-24T15:00:0${clock++}.000Z`,
        });
        const turn1 = recording.buildPayload([welcome, firstUser]);
        const turn2 = recording.buildPayload([
          welcome,
          firstUser,
          firstReply,
          secondUser,
        ]);
        assertEqual(turn2.messageTimes[0], turn1.messageTimes[0], "welcome time");
        assertEqual(turn2.messageTimes[1], turn1.messageTimes[1], "first user time");
        assert(
          turn2.messageTimes[2] !== turn1.messageTimes[0],
          "new assistant time is distinct"
        );
        assert(
          turn2.messageTimes[3] !== turn2.messageTimes[2],
          "new user time is distinct"
        );
      },
    },
    {
      name: "reset also clears remembered message times",
      run: () => {
        let clock = 0;
        const recording = createPublicChatRecording({
          now: () => `2026-08-24T16:00:0${clock++}.000Z`,
        });
        const before = recording.buildPayload([welcome, firstUser]);
        recording.reset();
        const after = recording.buildPayload([welcome, firstUser]);
        assert(
          after.messageTimes[0] !== before.messageTimes[0],
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
