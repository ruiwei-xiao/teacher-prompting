/**
 * Task-local verification for the identity-choice modal (task 4.1).
 * Source-checks the non-dismissible English gate and behavior-checks that
 * overlay/Escape are not a choice and that anonymous continuation unlocks
 * only after POST /api/public-chat/visitor succeeds.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-modal.ts
 */
import fs from "fs/promises";
import path from "path";

type Check = { name: string; run: () => void | Promise<void> };

const MODAL_PATH = "components/public/IdentityChoiceModal.tsx";
const PUBLISHED_CHATBOT_PATH = "components/public/PublishedChatbot.tsx";
const VISITOR_COOKIE_URL = "/api/public-chat/visitor";

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

function classNameBefore(source: string, labelToken: string): string {
  const index = source.indexOf(labelToken);
  assert(index > 0, `${labelToken} is rendered`);
  const matches = [...source.slice(0, index).matchAll(/className="([^"]*)"/g)];
  assert(matches.length > 0, `className before ${labelToken}`);
  return matches[matches.length - 1][1];
}

function overlayOpenTag(source: string): string {
  const classIndex = source.indexOf("fixed inset-0");
  assert(classIndex > 0, "overlay uses fixed inset-0");
  const tagStart = source.lastIndexOf("<div", classIndex);
  const tagEnd = source.indexOf(">", classIndex);
  assert(tagStart >= 0 && tagEnd > classIndex, "overlay is a div");
  return source.slice(tagStart, tagEnd + 1);
}

async function main() {
  const modalModule = await import("../components/public/IdentityChoiceModal");
  const modalExports: Record<string, unknown> = { ...modalModule };
  const source = await readSource(MODAL_PATH);
  const publishedSource = await readSource(PUBLISHED_CHATBOT_PATH);

  const continueAnonymously = modalExports.continueAnonymouslyAfterVisitorCookie;
  const choiceForDismissal = modalExports.identityChoiceForDismissal;
  assert(
    typeof continueAnonymously === "function",
    "continueAnonymouslyAfterVisitorCookie is exported"
  );
  assert(
    typeof choiceForDismissal === "function",
    "identityChoiceForDismissal is exported"
  );

  const requestAnonymousContinuation =
    continueAnonymously as (
      fetchImpl: (
        input: string,
        init: { method: "POST" }
      ) => Promise<{ ok: boolean }>,
      onContinueAnonymously: () => void
    ) => Promise<boolean>;
  const dismissalChoice = choiceForDismissal as (
    dismissal: "overlay-click" | "escape-key"
  ) => null;

  const checks: Check[] = [
    {
      name: "modal imports shared copy constants and renders them",
      run: () => {
        assert(
          /from ["']@\/lib\/public-chat-identity\/copy["']/.test(source),
          "imports lib/public-chat-identity/copy"
        );
        for (const name of [
          "LOGIN_ACTION_LABEL",
          "ANONYMOUS_ACTION_LABEL",
          "REMEMBERED_VISITOR_SENTENCE",
          "LATER_LINKING_SENTENCE",
        ]) {
          assert(
            new RegExp(`\\b${name}\\b`).test(source),
            `references ${name}`
          );
          assert(
            source.includes(`{${name}}`),
            `renders {${name}} instead of a duplicated sentence`
          );
        }
        assert(
          !source.includes("Log in to continue"),
          "does not hardcode the login sentence"
        );
        assert(
          !source.includes("Continue anonymously"),
          "does not hardcode the anonymous sentence"
        );
        assert(
          !source.includes("remembered visitor identity"),
          "does not hardcode the remembered-visitor sentence"
        );
        assert(
          !source.includes("associates prior chats"),
          "does not hardcode the later-linking sentence"
        );
      },
    },
    {
      name: "login is a filled primary button and anonymous is quieter text",
      run: () => {
        const loginClass = classNameBefore(source, "{LOGIN_ACTION_LABEL}");
        const anonymousClass = classNameBefore(
          source,
          "{ANONYMOUS_ACTION_LABEL}"
        );
        assert(
          loginClass.includes("bg-sky-600") && loginClass.includes("text-white"),
          "login action is a filled primary button"
        );
        assert(
          !anonymousClass.includes("bg-"),
          "anonymous action has no filled background"
        );
        assert(
          anonymousClass.includes("text-slate-"),
          "anonymous action is quieter text"
        );
        assert(
          source.indexOf("{LOGIN_ACTION_LABEL}") <
            source.indexOf("{ANONYMOUS_ACTION_LABEL}"),
          "login action is presented before anonymous continuation"
        );
      },
    },
    {
      name: "overlay matches the existing dialog pattern and has no dismiss click",
      run: () => {
        const tag = overlayOpenTag(source);
        assert(
          tag.includes(
            "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          ),
          "uses the existing overlay classes"
        );
        assert(!tag.includes("onClick"), "backdrop has no click handler");
        assert(!source.includes("Dialog"), "does not use a shared dialog primitive");
        assert(!source.includes("onClose"), "has no close callback");
        assert(!/>\s*Close\s*</.test(source), "has no Close control");
      },
    },
    {
      name: "escape and overlay are not a choice and do not close the modal",
      run: () => {
        assertEqual(
          dismissalChoice("overlay-click"),
          null,
          "overlay click choice"
        );
        assertEqual(dismissalChoice("escape-key"), null, "escape choice");
        assert(!source.includes('"Escape"'), "no Escape key comparison");
        assert(!source.includes("'Escape'"), "no Escape key comparison");
        assert(!/onKeyDown|keydown|keyup|KeyboardEvent/.test(source), "no key listener");
        assert(!/return null/.test(source), "modal does not unmount itself");
        assert(
          !/setOpen|setVisible|setDismissed/.test(source),
          "modal has no dismiss state"
        );
      },
    },
    {
      name: "login calls onLogIn and does not hide the modal",
      run: () => {
        assert(source.includes("onLogIn"), "accepts onLogIn");
        assert(
          /onClick=\{onLogIn\}/.test(source),
          "login button calls onLogIn directly"
        );
        const loginIndex = source.indexOf("onClick={onLogIn}");
        const loginRegion = source.slice(loginIndex, loginIndex + 180);
        assert(
          !/return null|setOpen|onClose/.test(loginRegion),
          "login handler does not close the modal"
        );
      },
    },
    {
      name: "anonymous continuation unlocks only after a successful visitor POST",
      run: async () => {
        const calls: string[] = [];
        let parentCalls = 0;
        const unlocked = await requestAnonymousContinuation(
          async (input, init) => {
            calls.push(`${init.method} ${input}`);
            return { ok: true };
          },
          () => {
            parentCalls += 1;
          }
        );
        assert(unlocked, "successful POST unlocks");
        assertEqual(calls, [`POST ${VISITOR_COOKIE_URL}`], "visitor POST");
        assertEqual(parentCalls, 1, "parent notified once");

        parentCalls = 0;
        const rejected = await requestAnonymousContinuation(async () => {
          return { ok: false };
        }, () => {
          parentCalls += 1;
        });
        assert(!rejected, "failed POST stays gated");
        assertEqual(parentCalls, 0, "parent not notified on HTTP failure");

        parentCalls = 0;
        const thrown = await requestAnonymousContinuation(async () => {
          throw new Error("network");
        }, () => {
          parentCalls += 1;
        });
        assert(!thrown, "network failure stays gated");
        assertEqual(parentCalls, 0, "parent not notified on network failure");

        assert(
          source.includes("continueAnonymouslyAfterVisitorCookie"),
          "component uses the visitor POST helper"
        );
        assert(
          source.includes("onContinueAnonymously"),
          "accepts onContinueAnonymously"
        );
        assert(
          source.includes(`"${VISITOR_COOKIE_URL}"`),
          "helper posts to the visitor cookie endpoint"
        );
        assert(
          source.includes('method: "POST"'),
          "visitor request is a POST"
        );
        const helperStart = source.indexOf(
          "function continueAnonymouslyAfterVisitorCookie"
        );
        assert(helperStart > 0, "helper is declared in the modal module");
        const helperBody = source.slice(helperStart, helperStart + 700);
        const okCheck = helperBody.indexOf("response.ok");
        const notify = helperBody.indexOf("onContinueAnonymously()");
        assert(okCheck > 0 && notify > okCheck, "parent runs only after response.ok");
        assert(
          helperBody.indexOf("return false") < notify,
          "failure returns before notifying the parent"
        );
      },
    },
    {
      name: "modal is a client component and is not hosted in PublishedChatbot yet",
      run: () => {
        assert(source.startsWith('"use client"'), "use client directive");
        assert(!/\bany\b/.test(source), "modal does not use any");
        assert(
          !publishedSource.includes("IdentityChoiceModal"),
          "PublishedChatbot does not host the modal yet"
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
