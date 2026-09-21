/**
 * Task-local verification for public-chat sign-in and conversation resume
 * (task 4.2).
 *
 * Run: npx tsx scripts/verify-public-chat-identity-sign-in.ts
 */
import fs from "fs/promises";
import path from "path";
import { createPublicChatRecording } from "../components/public/chat-recording";

type Check = { name: string; run: () => void | Promise<void> };

const CONTROL_PATH = "components/public/PublicChatSignInControl.tsx";
const RESUME_PATH = "components/public/conversation-resume.ts";
const RESUME_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
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
  const resume = await import("../components/public/conversation-resume");
  const controlSource = await readSource(CONTROL_PATH);
  const resumeSource = await readSource(RESUME_PATH);

  const checks: Check[] = [
    {
      name: "resume storage round-trips app and conversation ids",
      run: () => {
        const storage = memoryStorage();
        resume.rememberPublicChatResume(
          { appId: "bot-1", sessionId: RESUME_ID },
          storage
        );
        assertEqual(
          resume.readPublicChatResume(storage),
          { appId: "bot-1", sessionId: RESUME_ID },
          "stored resume"
        );
        assertEqual(
          resume.readPublicChatResume(memoryStorage()),
          null,
          "missing resume"
        );
        storage.setItem(resume.PUBLIC_CHAT_RESUME_KEY, "{");
        assertEqual(
          resume.readPublicChatResume(storage),
          null,
          "invalid resume"
        );
      },
    },
    {
      name: "resume key is tab session storage and not a visitor id",
      run: () => {
        assertEqual(
          resume.PUBLIC_CHAT_RESUME_KEY,
          "tp_public_chat_resume",
          "resume key"
        );
        assert(
          resumeSource.includes("sessionStorage"),
          "browser helper uses sessionStorage"
        );
        assert(
          !resumeSource.includes("tp_anonymous_visitor_id"),
          "resume is not the visitor cookie"
        );
      },
    },
    {
      name: "recording helper reuses a provided conversation id",
      run: () => {
        const recording = createPublicChatRecording({ sessionId: RESUME_ID });
        const payload = recording.buildPayload([{ role: "assistant" }]);
        assertEqual(recording.sessionId, RESUME_ID, "sessionId");
        assertEqual(payload.sessionId, RESUME_ID, "payload sessionId");
        recording.reset();
        assert(recording.sessionId !== RESUME_ID, "reset starts a new conversation");
      },
    },
    {
      name: "sign-in control reuses SignInPanel with the public chat callback",
      run: () => {
        assert(controlSource.startsWith('"use client"'), "client component");
        assert(
          controlSource.includes("SignInPanel"),
          "renders the existing sign-in panel"
        );
        assert(
          controlSource.includes("callbackUrl={callbackUrl}"),
          "passes the public chat callback path"
        );
        assert(
          controlSource.includes("rememberPublicChatResume"),
          "writes the resume record before leaving"
        );
        assert(
          controlSource.includes(">Log in<"),
          "quieter Log in control exists"
        );
        assert(
          /text-slate-/.test(controlSource),
          "Log in control uses quieter text styling"
        );
        assert(!/\bany\b/.test(controlSource), "control does not use any");
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
