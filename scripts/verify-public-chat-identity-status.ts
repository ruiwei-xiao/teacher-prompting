/**
 * Task-local verification for visible public-chat identity and account actions.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-status.ts
 */
import fs from "fs/promises";
import path from "path";

type Check = { name: string; run: () => void | Promise<void> };

const PAGE_PATH = "app/chat/[appId]/page.tsx";
const CHATBOT_PATH = "components/public/PublishedChatbot.tsx";
const STATUS_PATH = "components/public/PublicChatIdentityStatus.tsx";
const SIGN_IN_CONTROL_PATH = "components/public/PublicChatSignInControl.tsx";
const SIGN_IN_PANEL_PATH = "components/auth/SignInPanel.tsx";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
}

async function main() {
  const pageSource = await readSource(PAGE_PATH);
  const chatbotSource = await readSource(CHATBOT_PATH);
  const statusSource = await readSource(STATUS_PATH);
  const signInControlSource = await readSource(SIGN_IN_CONTROL_PATH);
  const signInPanelSource = await readSource(SIGN_IN_PANEL_PATH);

  const checks: Check[] = [
    {
      name: "public page passes the current account identity",
      run: () => {
        assert(pageSource.includes("signedInUser="), "passes signedInUser");
        assert(pageSource.includes("session.user.name"), "passes account name");
        assert(pageSource.includes("session.user.email"), "passes account email");
        assert(pageSource.includes("session.user.image"), "passes account image");
      },
    },
    {
      name: "published chat hosts identity status in its header",
      run: () => {
        assert(
          chatbotSource.includes("PublicChatIdentityStatus"),
          "imports and renders PublicChatIdentityStatus"
        );
        assert(
          chatbotSource.includes("continuedAnonymously"),
          "anonymous status follows the completed identity choice"
        );
        assert(
          chatbotSource.includes("signedInUser={signedInUser}"),
          "forwards the current account"
        );
        assert(
          chatbotSource.includes("callbackUrl={chatCallbackUrl}"),
          "logout and login return to the same public chat"
        );
      },
    },
    {
      name: "anonymous status has a clear outlined login button",
      run: () => {
        assert(statusSource.includes(">Anonymous<"), "shows Anonymous status");
        assert(
          statusSource.includes("PublicChatSignInControl"),
          "reuses the resume-aware sign-in control"
        );
        assert(
          statusSource.includes('variant="quiet"'),
          "uses the post-anonymous login variant"
        );
        assert(
          signInControlSource.includes("border-sky-"),
          "Log in uses a visible outlined button"
        );
        assert(
          !signInControlSource.includes("underline"),
          "Log in is not a subtle text link"
        );
      },
    },
    {
      name: "signed-in status exposes account, sessions, and logout",
      run: () => {
        assert(
          statusSource.includes("aria-expanded={open}"),
          "account control opens a menu"
        );
        assert(
          statusSource.includes("origin-top-right"),
          "account menu grows from its trigger"
        );
        assert(statusSource.includes("signedInUser.name"), "shows account name");
        assert(statusSource.includes("signedInUser.email"), "shows account email");
        assert(statusSource.includes('href="/sessions"'), "links to My sessions");
        assert(statusSource.includes(">My sessions<"), "labels My sessions");
        assert(statusSource.includes("signOut"), "uses existing Auth.js logout");
        assert(statusSource.includes("{ callbackUrl }"), "logout returns to chat");
        assert(statusSource.includes(">Log out<"), "labels Log out");
        assert(
          statusSource.includes('referrerPolicy="no-referrer"'),
          "profile photos omit the page referrer"
        );
        assert(
          statusSource.includes("onError={() => setFailed(true)}"),
          "a failed profile photo falls back to an initial"
        );
        assert(
          statusSource.includes('document.addEventListener("pointerdown", closeIfOutside)'),
          "an outside press closes the account menu"
        );
        assert(
          statusSource.includes("menu.contains(target)"),
          "presses inside the account menu stay open"
        );
        assert(
          statusSource.includes("setOpen(false)"),
          "outside presses clear the open menu"
        );
      },
    },
    {
      name: "public sign-in panel is explicitly light and chat-specific",
      run: () => {
        assert(
          signInPanelSource.includes('appearance?: "adaptive" | "light"'),
          "SignInPanel supports a light public-chat appearance"
        );
        assert(
          signInControlSource.includes('appearance="light"'),
          "public chat requests the light appearance"
        );
        assert(
          signInControlSource.includes(
            'description="Continue this chat with your account."'
          ),
          "public sign-in copy matches the chat context"
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
