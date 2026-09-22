/**
 * Task-local verification for resuming a public chat after later sign-in
 * (task 4.4).
 *
 * Run: npx tsx scripts/verify-public-chat-identity-resume.ts
 */
import fs from "fs/promises";
import path from "path";
import { createPublicChatRecording } from "../components/public/chat-recording";
import {
  PUBLIC_CHAT_RESUME_KEY,
  rememberPublicChatResume,
} from "../components/public/conversation-resume";
import { loadResumedPublicChat } from "../components/public/resume-public-chat";

type Check = { name: string; run: () => void | Promise<void> };

const CHATBOT_PATH = "components/public/PublishedChatbot.tsx";
const RESUME_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const STARTED = "2026-09-21T12:00:00.000Z";

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

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem(key: string) {
      return items.has(key) ? items.get(key)! : null;
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
    removeItem(key: string) {
      items.delete(key);
    },
  };
}

async function main() {
  const chatbotSource = await fs.readFile(
    path.join(process.cwd(), CHATBOT_PATH),
    "utf-8"
  );

  const checks: Check[] = [
    {
      name: "signed-in resume claims before loading the same transcript",
      run: async () => {
        const storage = memoryStorage();
        rememberPublicChatResume(
          { appId: "bot-1", sessionId: RESUME_ID },
          storage
        );
        const order: string[] = [];
        const resumed = await loadResumedPublicChat({
          isSignedIn: true,
          appId: "bot-1",
          storage,
          claim: async () => {
            order.push("claim");
          },
          fetchTranscript: async (sessionId) => {
            order.push(`fetch ${sessionId}`);
            assert(
              storage.getItem(PUBLIC_CHAT_RESUME_KEY),
              "resume remains available while the transcript loads"
            );
            return {
              ok: true,
              json: async () => ({
                session: {
                  appId: "bot-1",
                  messages: [
                    { role: "assistant", content: "Welcome", at: STARTED },
                    { role: "user", content: "Hello", at: "2026-09-21T12:01:00.000Z" },
                  ],
                },
              }),
            };
          },
        });
        assertEqual(order, ["claim", `fetch ${RESUME_ID}`], "claim before fetch");
        assertEqual(resumed?.sessionId, RESUME_ID, "session id");
        assertEqual(
          resumed?.messages.map((message) => message.content),
          ["Welcome", "Hello"],
          "transcript"
        );
        assertEqual(resumed?.messageTimes[0], STARTED, "original message time");
        assertEqual(storage.getItem(PUBLIC_CHAT_RESUME_KEY), null, "resume consumed");
      },
    },
    {
      name: "failed or mismatched resume starts over without throwing",
      run: async () => {
        const storage = memoryStorage();
        rememberPublicChatResume(
          { appId: "bot-1", sessionId: RESUME_ID },
          storage
        );
        let claims = 0;
        const failed = await loadResumedPublicChat({
          isSignedIn: true,
          appId: "bot-1",
          storage,
          claim: async () => {
            claims += 1;
            throw new Error("claim down");
          },
          fetchTranscript: async () => ({
            ok: false,
            json: async () => ({}),
          }),
        });
        assertEqual(failed, null, "failed resume");
        assertEqual(claims, 1, "claim still attempted");
        assertEqual(storage.getItem(PUBLIC_CHAT_RESUME_KEY), null, "failed resume consumed");

        rememberPublicChatResume(
          { appId: "other-bot", sessionId: RESUME_ID },
          storage
        );
        let fetches = 0;
        const mismatched = await loadResumedPublicChat({
          isSignedIn: true,
          appId: "bot-1",
          storage,
          claim: async () => {},
          fetchTranscript: async () => {
            fetches += 1;
            return { ok: true, json: async () => ({}) };
          },
        });
        assertEqual(mismatched, null, "other app");
        assertEqual(fetches, 0, "other app is not fetched");
        assert(
          storage.getItem(PUBLIC_CHAT_RESUME_KEY),
          "other app resume stays stored"
        );

        let unsignedClaims = 0;
        const unsigned = await loadResumedPublicChat({
          isSignedIn: false,
          appId: "bot-1",
          storage,
          claim: async () => {
            unsignedClaims += 1;
          },
          fetchTranscript: async () => {
            fetches += 1;
            return { ok: true, json: async () => ({}) };
          },
        });
        assertEqual(unsigned, null, "unsigned");
        assertEqual(unsignedClaims, 0, "unsigned does not claim");
        assertEqual(fetches, 0, "unsigned does not fetch");
      },
    },
    {
      name: "recording helper keeps the resumed id and original times",
      run: () => {
        const recording = createPublicChatRecording({
          now: () => "2026-09-21T18:00:00.000Z",
          createId: () => "new-id",
        });
        recording.resumeConversation(RESUME_ID, [STARTED]);
        const payload = recording.buildPayload([
          { role: "assistant", content: "Welcome" },
          { role: "user", content: "Hello" },
        ]);
        assertEqual(payload.sessionId, RESUME_ID, "resumed session");
        assertEqual(payload.messageTimes[0], STARTED, "kept original time");
        assertEqual(
          payload.messageTimes[1],
          "2026-09-21T18:00:00.000Z",
          "new turn gets a new time"
        );
        recording.reset();
        assertEqual(recording.sessionId, "new-id", "reset starts over");
      },
    },
    {
      name: "published chat loads the resume and does not surface a blocking error",
      run: () => {
        assert(
          chatbotSource.includes("loadResumedPublicChat"),
          "chat loads the resumed transcript"
        );
        assert(
          chatbotSource.includes("resumeConversation"),
          "chat reuses the resumed conversation id"
        );
        assert(
          chatbotSource.includes("`/api/sessions/${sessionId}`") ||
            chatbotSource.includes("/api/sessions/"),
          "transcript request uses the session endpoint"
        );
        const loadIndex = chatbotSource.lastIndexOf("loadResumedPublicChat");
        const effectEnd = chatbotSource.indexOf(
          "}, [isSignedIn, appId, recording]);",
          loadIndex
        );
        const loadRegion = chatbotSource.slice(loadIndex, effectEnd);
        assert(
          !loadRegion.includes("setComposerError"),
          "failed resume does not block the composer with an error"
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
