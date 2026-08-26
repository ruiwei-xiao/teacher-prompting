/**
 * Task-local verification for the editor chrome Activity entry point (task 6.2).
 * Source checks EditorChrome's optional activityHref link, editor page wiring,
 * and SharedProjectEditor remaining without an activity control.
 *
 * Run: npx tsx scripts/verify-editor-chrome-activity.ts
 */
import fs from "fs/promises";
import path from "path";
import { activityHrefForApp } from "../lib/chat-session-ui/nav";

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

function extractEditorChromeCall(source: string): string {
  const start = source.indexOf("<EditorChrome");
  assert(start !== -1, "renders EditorChrome");
  const end = source.indexOf(">", start);
  assert(end !== -1, "EditorChrome opening tag is closed");
  return source.slice(start, end + 1);
}

async function main() {
  const checks: Check[] = [
    {
      name: "activityHrefForApp remains the stable per-bot activity URL",
      run: () => {
        assertEqual(
          activityHrefForApp("bot-42"),
          "/app/bot-42/activity",
          "activity href"
        );
      },
    },
    {
      name: "EditorChrome accepts optional activityHref and imports next/link",
      run: async () => {
        const source = await readSource("components/editor/EditorChrome.tsx");
        assert(
          source.includes('from "next/link"') ||
            source.includes("from 'next/link'"),
          "imports Link from next/link"
        );
        assert(
          /activityHref\?:\s*string/.test(source),
          "declares optional activityHref?: string"
        );
      },
    },
    {
      name: "EditorChrome renders an Activity Link when activityHref is set",
      run: async () => {
        const source = await readSource("components/editor/EditorChrome.tsx");
        assert(
          /href=\{activityHref\}/.test(source),
          "Link href uses activityHref"
        );
        assert(
          />\s*Activity\s*</.test(source),
          'visible label is "Activity"'
        );
        assert(
          /\{activityHref\s*(\?|&{2})/.test(source) ||
            /activityHref\s*\?/.test(source),
          "Activity Link is gated on activityHref"
        );
      },
    },
    {
      name: "Activity control is visually secondary to Publish",
      run: async () => {
        const source = await readSource("components/editor/EditorChrome.tsx");
        const activityMatch = source.match(
          /<Link[\s\S]*?href=\{activityHref\}[\s\S]*?>[\s\S]*?Activity[\s\S]*?<\/Link>/
        );
        assert(activityMatch, "found Activity Link");
        const activityBlock = activityMatch[0];
        assert(
          !activityBlock.includes("bg-sky-600"),
          "Activity Link is not the filled Publish (bg-sky-600) style"
        );
        assert(
          source.includes("bg-sky-600"),
          "Publish still uses the primary filled sky style"
        );
      },
    },
    {
      name: "editor page passes activityHref from activityHrefForApp(appId)",
      run: async () => {
        const source = await readSource("app/app/[appId]/editor/page.tsx");
        assert(
          source.includes('from "@/lib/chat-session-ui/nav"') ||
            source.includes("from '@/lib/chat-session-ui/nav'"),
          "imports @/lib/chat-session-ui/nav"
        );
        assert(
          source.includes("activityHrefForApp"),
          "uses activityHrefForApp"
        );
        const chromeCall = extractEditorChromeCall(source);
        assert(
          /activityHref=\{activityHrefForApp\(\s*appId\s*\)\}/.test(chromeCall),
          "passes activityHref={activityHrefForApp(appId)}"
        );
      },
    },
    {
      name: "SharedProjectEditor does not pass activityHref",
      run: async () => {
        const source = await readSource(
          "components/project/SharedProjectEditor.tsx"
        );
        const chromeCall = extractEditorChromeCall(source);
        assert(
          !chromeCall.includes("activityHref"),
          "EditorChrome call omits activityHref"
        );
        assert(
          !source.includes("activityHrefForApp"),
          "does not import or call activityHrefForApp"
        );
        assert(
          !source.includes("activityHref"),
          "does not mention activityHref anywhere"
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
