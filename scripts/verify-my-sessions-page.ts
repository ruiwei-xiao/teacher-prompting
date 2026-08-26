/**
 * Task-local verification for the My sessions page (task 5.3).
 * Source checks the server auth gate and the client master-detail view.
 *
 * Run: npx tsx scripts/verify-my-sessions-page.ts
 */
import fs from "fs/promises";
import path from "path";
import { MY_SESSIONS_HREF } from "../lib/chat-session-ui/nav";

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

async function main() {
  const checks: Check[] = [
    {
      name: "MY_SESSIONS_HREF is /sessions",
      run: () => {
        assertEqual(MY_SESSIONS_HREF, "/sessions", "my sessions href");
      },
    },
    {
      name: "page.tsx gates signed-out visitors with SignInPanel callback /sessions",
      run: async () => {
        const source = await readSource("app/sessions/page.tsx");
        assert(
          source.includes('from "@/auth"') && source.includes("auth()"),
          "calls auth()"
        );
        assert(
          source.includes("SignInPanel"),
          "renders SignInPanel when signed out"
        );
        assert(
          /callbackUrl=\{(?:callbackUrl\s*\|\|\s*)?["']\/sessions["']\}/.test(
            source
          ) ||
            /callbackUrl=\{MY_SESSIONS_HREF\}/.test(source) ||
            /callbackUrl=["']\/sessions["']/.test(source),
          'SignInPanel callbackUrl="/sessions"'
        );
        assert(
          source.includes('from "@/components/auth/SignInPanel"'),
          "imports SignInPanel from the existing auth panel"
        );
        assert(
          !source.includes('from "next/navigation"') ||
            !/\bredirect\s*\(/.test(source),
          "does not invent a redirect-to-/auth/signin flow"
        );
        assert(
          !source.includes("notFound"),
          "signed-out visitors get SignInPanel, not not-found"
        );
        assert(
          source.includes("googleEnabled") && source.includes("microsoftEnabled"),
          "passes provider flags like starred"
        );
      },
    },
    {
      name: "page.tsx wraps MySessionsView in AppShell for signed-in users",
      run: async () => {
        const source = await readSource("app/sessions/page.tsx");
        assert(source.includes("AppShell"), "AppShell chrome");
        assert(source.includes("MySessionsView"), "renders MySessionsView");
        assert(source.includes("type-display"), "type-display heading");
        assert(/My sessions/.test(source), "My sessions heading copy");
        assert(
          source.includes("bg-gradient-to-br"),
          "gradient background like starred"
        );
        assert(
          !source.includes('"use client"'),
          "sessions page is a Server Component"
        );
      },
    },
    {
      name: "MySessionsView uses fetchMySessions and nameMode bot",
      run: async () => {
        const source = await readSource(
          "components/sessions/MySessionsView.tsx"
        );
        assert(
          source.includes('"use client"'),
          "MySessionsView is a Client Component"
        );
        assert(
          source.includes("fetchMySessions"),
          "loads participant sessions via fetchMySessions"
        );
        assert(
          source.includes("fetchTranscript"),
          "loads transcripts via fetchTranscript"
        );
        assert(source.includes("SessionList"), "composes SessionList");
        assert(
          source.includes("SessionTranscript"),
          "composes SessionTranscript"
        );
        assert(
          /nameMode=["']bot["']/.test(source) ||
            /nameMode=\{\s*["']bot["']\s*\}/.test(source),
          'nameMode="bot"'
        );
        assert(source.includes("emptyMessage"), "emptyMessage present");
        assert(
          /no sessions yet/i.test(source),
          "empty state explains no sessions yet"
        );
        assert(
          source.includes("MY_SESSIONS_HREF"),
          "uses MY_SESSIONS_HREF for the stable sessions URL"
        );
      },
    },
    {
      name: "MySessionsView opens transcripts at a stable session URL",
      run: async () => {
        const source = await readSource(
          "components/sessions/MySessionsView.tsx"
        );
        assert(
          source.includes("useSearchParams") ||
            source.includes("searchParams"),
          "reads session selection from the URL"
        );
        assert(/["']session["']/.test(source), "session query param");
        assert(
          source.includes("router.replace") ||
            source.includes("router.push") ||
            source.includes("MY_SESSIONS_HREF"),
          "updates the sessions URL when a session is selected"
        );
        assert(
          !/\bonDelete\b/.test(source) && !/\bonEdit\b/.test(source),
          "no edit/delete affordances"
        );
      },
    },
    {
      name: "bot-mode unshared sessions include Not shared with owner badge",
      run: async () => {
        const display = await import("../components/sessions/session-display");
        const viewSource = await readSource(
          "components/sessions/MySessionsView.tsx"
        );
        const listSource = await readSource(
          "components/sessions/SessionList.tsx"
        );
        assert(
          /nameMode=["']bot["']/.test(viewSource) ||
            /nameMode=\{\s*["']bot["']\s*\}/.test(viewSource),
          'MySessionsView stays nameMode="bot"'
        );
        assert(
          listSource.includes("sessionNotSharedBadge") ||
            listSource.includes("sessionBadges") ||
            listSource.includes("sessionBadgeClassName"),
          "SessionList renders the not-shared badge helper"
        );
        assertEqual(
          display.sessionNotSharedBadge({ shared: false }, "bot"),
          "Not shared with owner",
          "bot-mode unshared badge"
        );
        assertEqual(
          display.sessionBadges(
            { surface: "public", shared: false, appExists: true },
            "bot"
          ),
          ["Public chat", "Not shared with owner"],
          "bot-mode unshared badges"
        );
        assertEqual(
          display.sessionNotSharedBadge({ shared: true }, "bot"),
          null,
          "bot-mode shared has no not-shared badge"
        );
      },
    },
    {
      name: "deleted-bot labeling is delegated to SessionList appExists handling",
      run: async () => {
        const viewSource = await readSource(
          "components/sessions/MySessionsView.tsx"
        );
        const listSource = await readSource(
          "components/sessions/SessionList.tsx"
        );
        assert(
          viewSource.includes("SessionList"),
          "MySessionsView composes SessionList rather than reimplementing badges"
        );
        assert(
          listSource.includes("sessionDeletedBotBadge") ||
            listSource.includes("appExists") ||
            listSource.includes("sessionBadges"),
          "SessionList already handles deleted-bot via appExists"
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
