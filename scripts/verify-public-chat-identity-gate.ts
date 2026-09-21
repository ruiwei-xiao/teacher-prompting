/**
 * Task-local verification for public-chat identity-gate copy (task 1.1).
 * Covers IdentityChoiceModal English strings: the prominent login label,
 * the quieter anonymous continuation label, and both privacy sentences.
 *
 * Run: npx tsx scripts/verify-public-chat-identity-gate.ts
 */
import fs from "fs/promises";
import path from "path";

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

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf-8");
}

function readExportedString(
  moduleExports: Record<string, unknown>,
  name: string
): string {
  const value = moduleExports[name];
  assert(typeof value === "string", `${name} must be a string`);
  assert(value.trim().length > 0, `${name} must not be empty`);
  return value;
}

async function main() {
  const copyModule = await import("../lib/public-chat-identity/copy");
  const copyExports: Record<string, unknown> = { ...copyModule };

  const loginActionLabel = readExportedString(
    copyExports,
    "LOGIN_ACTION_LABEL"
  );
  const anonymousActionLabel = readExportedString(
    copyExports,
    "ANONYMOUS_ACTION_LABEL"
  );
  const rememberedVisitorSentence = readExportedString(
    copyExports,
    "REMEMBERED_VISITOR_SENTENCE"
  );
  const laterLinkingSentence = readExportedString(
    copyExports,
    "LATER_LINKING_SENTENCE"
  );

  const checks: Check[] = [
    {
      name: "primary login action label is Log in to continue",
      run: () => {
        assertEqual(loginActionLabel, "Log in to continue", "login label");
      },
    },
    {
      name: "secondary anonymous action label is Continue anonymously",
      run: () => {
        assertEqual(
          anonymousActionLabel,
          "Continue anonymously",
          "anonymous label"
        );
      },
    },
    {
      name: "remembered-visitor sentence discloses browser visitor identity",
      run: () => {
        assert(
          /remembered visitor identity/i.test(rememberedVisitorSentence),
          "mentions a remembered visitor identity"
        );
        assert(
          /this browser/i.test(rememberedVisitorSentence),
          "mentions this browser"
        );
        assert(
          /anonymously/i.test(rememberedVisitorSentence),
          "ties the disclosure to anonymous continuation"
        );
      },
    },
    {
      name: "later-linking sentence discloses account association after sign-in",
      run: () => {
        assert(
          /sign(?:ing)? in later/i.test(laterLinkingSentence),
          "mentions signing in later"
        );
        assert(
          /associat/i.test(laterLinkingSentence),
          "mentions association with the account"
        );
        assert(
          /account/i.test(laterLinkingSentence),
          "mentions the visitor's account"
        );
        assert(
          /chats/i.test(laterLinkingSentence),
          "mentions prior chats"
        );
      },
    },
    {
      name: "copy module is the single source of both disclosure sentences",
      run: async () => {
        const source = await readSource("lib/public-chat-identity/copy.ts");
        assert(
          source.includes(rememberedVisitorSentence),
          "remembered-visitor sentence lives in copy.ts"
        );
        assert(
          source.includes(laterLinkingSentence),
          "later-linking sentence lives in copy.ts"
        );
        assert(
          source.includes(loginActionLabel),
          "login label lives in copy.ts"
        );
        assert(
          source.includes(anonymousActionLabel),
          "anonymous label lives in copy.ts"
        );
        assert(
          rememberedVisitorSentence !== laterLinkingSentence,
          "the two privacy sentences are distinct"
        );
        assert(!/\bany\b/.test(source), "copy.ts does not use any");
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
