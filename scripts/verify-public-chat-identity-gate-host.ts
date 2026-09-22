/**
 * Task-local verification for hosting the public-chat identity gate (task 4.3).
 *
 * Run: npx tsx scripts/verify-public-chat-identity-gate-host.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  publicChatCallbackPath,
  publicChatCanParticipate,
  publicChatShouldClaimOnMount,
  publicChatShowsIdentityGate,
} from "../components/public/public-chat-gate";

type Check = { name: string; run: () => void | Promise<void> };

const PAGE_PATH = "app/chat/[appId]/page.tsx";
const CHATBOT_PATH = "components/public/PublishedChatbot.tsx";
const CLAIM_URL = "/api/public-chat/identity/claim";

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

async function main() {
  const pageSource = await readSource(PAGE_PATH);
  const chatbotSource = await readSource(CHATBOT_PATH);

  const checks: Check[] = [
    {
      name: "unsigned visitors stay gated even without a cookie input",
      run: () => {
        const unsigned = {
          isSignedIn: false,
          continuedAnonymously: false,
          signingIn: false,
        };
        assert(!publicChatCanParticipate(unsigned), "cannot chat");
        assert(publicChatShowsIdentityGate(unsigned), "modal is shown");
        assert(!publicChatShouldClaimOnMount(false), "unsigned mount does not claim");
      },
    },
    {
      name: "signed-in visitors skip the modal and claim on mount",
      run: () => {
        const signedIn = {
          isSignedIn: true,
          continuedAnonymously: false,
          signingIn: false,
        };
        assert(publicChatCanParticipate(signedIn), "chatting is allowed");
        assert(!publicChatShowsIdentityGate(signedIn), "no modal");
        assert(publicChatShouldClaimOnMount(true), "claim runs on signed-in mount");
      },
    },
    {
      name: "anonymous choice unlocks chat and login cancel returns to the gate",
      run: () => {
        const anonymous = {
          isSignedIn: false,
          continuedAnonymously: true,
          signingIn: false,
        };
        assert(publicChatCanParticipate(anonymous), "anonymous chat is allowed");
        assert(!publicChatShowsIdentityGate(anonymous), "modal closes after choice");

        const leavingToSignIn = {
          isSignedIn: false,
          continuedAnonymously: false,
          signingIn: true,
        };
        assert(
          !publicChatCanParticipate(leavingToSignIn),
          "chat stays blocked while login is in progress"
        );
        assert(
          !publicChatShowsIdentityGate(leavingToSignIn),
          "sign-in panel replaces the modal"
        );

        const cancelled = {
          isSignedIn: false,
          continuedAnonymously: false,
          signingIn: false,
        };
        assert(publicChatShowsIdentityGate(cancelled), "cancel shows the modal again");
        assert(!publicChatCanParticipate(cancelled), "cancel keeps chat unavailable");
      },
    },
    {
      name: "callback path is the opened public chat including search",
      run: () => {
        assertEqual(
          publicChatCallbackPath("bot-slug", {}),
          "/chat/bot-slug",
          "path without search"
        );
        assertEqual(
          publicChatCallbackPath("bot-slug", { from: "share", tag: ["a", "b"] }),
          "/chat/bot-slug?from=share&tag=a&tag=b",
          "path with search"
        );
      },
    },
    {
      name: "public chat page passes signed-in state and the callback path",
      run: () => {
        assert(pageSource.includes('from "@/auth"'), "page reads the session");
        assert(pageSource.includes("auth()"), "page calls auth()");
        assert(pageSource.includes("isSignedIn="), "passes isSignedIn");
        assert(pageSource.includes("chatCallbackUrl="), "passes chatCallbackUrl");
        assert(pageSource.includes("googleEnabled="), "passes googleEnabled");
        assert(pageSource.includes("microsoftEnabled="), "passes microsoftEnabled");
        assert(
          pageSource.includes("publicChatCallbackPath"),
          "builds the callback from the opened path"
        );
      },
    },
    {
      name: "published chat hosts the gate, blocks participation, and claims when signed in",
      run: () => {
        assert(
          chatbotSource.includes("IdentityChoiceModal"),
          "hosts the identity modal"
        );
        assert(
          chatbotSource.includes("PublicChatSignInControl"),
          "hosts the existing sign-in control"
        );
        assert(
          chatbotSource.includes('variant="panel"'),
          "login from the gate shows the sign-in panel"
        );
        assert(
          chatbotSource.includes("PublicChatIdentityStatus"),
          "anonymous and signed-in chat expose identity status"
        );
        assert(
          chatbotSource.includes("publicChatCanParticipate"),
          "participation follows the gate helper"
        );
        assert(
          chatbotSource.includes("publicChatShowsIdentityGate"),
          "modal visibility follows the gate helper"
        );
        assert(
          chatbotSource.includes("publicChatShouldClaimOnMount"),
          "claim follows the signed-in mount helper"
        );
        assert(
          chatbotSource.includes(`"${CLAIM_URL}"`),
          "signed-in mount posts the claim endpoint"
        );
        assert(
          chatbotSource.includes('method: "POST"'),
          "claim request is a POST"
        );
        assert(
          !chatbotSource.includes("tp_anonymous_visitor_id"),
          "an existing visitor cookie does not skip the gate"
        );
        const lockedUses = chatbotSource.match(/disabled=\{composerLocked\}/g) ?? [];
        assert(
          lockedUses.length >= 4,
          "composer, attachments, voice, and send stay disabled until a choice"
        );
        assert(
          chatbotSource.includes("busy={sharingBusy || !canParticipate}"),
          "sharing stays disabled until a choice"
        );
        assert(
          chatbotSource.includes("if (!canParticipate) return;"),
          "send and controls refuse participation while gated"
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
