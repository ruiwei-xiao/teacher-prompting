/**
 * Task-local verification for My bots card actions (task 6.3).
 * Source checks AppGrid Edit/Activity wiring and AppCard icon Delete.
 *
 * Run: npx tsx scripts/verify-app-card-actions.ts
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

function extractAppCardJsx(source: string): string {
  const start = source.indexOf("<AppCard");
  assert(start !== -1, "renders AppCard");
  const selfClose = source.indexOf("/>", start);
  const pairedClose = source.indexOf("</AppCard>", start);
  if (selfClose !== -1 && (pairedClose === -1 || selfClose < pairedClose)) {
    return source.slice(start, selfClose + 2);
  }
  assert(pairedClose !== -1, "AppCard JSX is closed");
  return source.slice(start, pairedClose + "</AppCard>".length);
}

async function main() {
  const checks: Check[] = [
    {
      name: "activityHrefForApp remains the stable per-bot activity URL",
      run: () => {
        assertEqual(
          activityHrefForApp("bot-7"),
          "/app/bot-7/activity",
          "activity href"
        );
      },
    },
    {
      name: "AppGrid labels the editor action Edit",
      run: async () => {
        const source = await readSource("components/dashboard/AppGrid.tsx");
        const card = extractAppCardJsx(source);
        assert(
          /ctaLabel=["']Edit["']/.test(card),
          'AppGrid passes ctaLabel="Edit"'
        );
        assert(
          !card.includes("Open bot"),
          "AppGrid no longer uses Open bot as the card CTA"
        );
      },
    },
    {
      name: "AppGrid wires onActivity through activityHrefForApp",
      run: async () => {
        const source = await readSource("components/dashboard/AppGrid.tsx");
        assert(
          source.includes('from "@/lib/chat-session-ui/nav"') ||
            source.includes("from '@/lib/chat-session-ui/nav'"),
          "imports @/lib/chat-session-ui/nav"
        );
        assert(
          source.includes("activityHrefForApp"),
          "uses activityHrefForApp"
        );
        const card = extractAppCardJsx(source);
        assert(
          /onActivity=\{/.test(card),
          "passes onActivity to AppCard"
        );
        assert(
          /activityHrefForApp\(\s*app\.id\s*\)/.test(source),
          "navigates with activityHrefForApp(app.id)"
        );
        assert(
          /router\.push\(\s*activityHrefForApp\(\s*app\.id\s*\)\s*\)/.test(
            source
          ),
          "onActivity calls router.push(activityHrefForApp(app.id))"
        );
      },
    },
    {
      name: "AppGrid still opens DeleteBotDialog from onDelete",
      run: async () => {
        const source = await readSource("components/dashboard/AppGrid.tsx");
        assert(
          source.includes('from "./DeleteBotDialog"') ||
            source.includes("from './DeleteBotDialog'"),
          "imports DeleteBotDialog"
        );
        assert(
          source.includes("<DeleteBotDialog"),
          "renders DeleteBotDialog"
        );
        const card = extractAppCardJsx(source);
        assert(/onDelete=\{/.test(card), "passes onDelete to AppCard");
        assert(
          /setDeleteTarget\(app\)/.test(source),
          "onDelete still sets the confirmation dialog target"
        );
      },
    },
    {
      name: "AppCard accepts optional onActivity and renders Activity",
      run: async () => {
        const source = await readSource("components/dashboard/AppCard.tsx");
        assert(
          /onActivity\?:\s*\(\)\s*=>\s*void/.test(source),
          "declares optional onActivity?: () => void"
        );
        assert(
          /onClick=\{onActivity\}/.test(source),
          "Activity control calls onActivity"
        );
        assert(
          />\s*Activity\s*</.test(source),
          'visible label is "Activity"'
        );
        assert(
          /\{onActivity\s*(\?|&{2})/.test(source) ||
            /onActivity\s*&&/.test(source),
          "Activity control is gated on onActivity"
        );
      },
    },
    {
      name: "AppCard Delete is an icon control with accessible label and tooltip",
      run: async () => {
        const source = await readSource("components/dashboard/AppCard.tsx");
        assert(
          source.includes("aria-label={`Delete ${title}`}"),
          "Delete uses aria-label={`Delete ${title}`}"
        );
        assert(
          /title=["']Delete["']/.test(source),
          'Delete uses title="Delete"'
        );
        assert(
          /onClick=\{onDelete\}/.test(source),
          "Delete still calls onDelete (confirmation stays in the parent dialog)"
        );
        assert(
          /rose/.test(source),
          "Delete keeps visually distinct rose/destructive styling"
        );
        const deleteMatch = source.match(
          /\{onDelete\s*&&\s*\(([\s\S]*?)\)\s*\}/
        );
        assert(deleteMatch, "Delete control is gated on onDelete");
        const deleteBlock = deleteMatch[1];
        assert(
          !/>\s*Delete bot\s*</.test(deleteBlock),
          'Delete is not a "Delete bot" text button'
        );
        assert(
          deleteBlock.includes("<svg") ||
            deleteBlock.includes("<Icon") ||
            deleteBlock.includes("<TrashIcon"),
          "Delete renders an icon rather than text"
        );
      },
    },
    {
      name: "StarredBotGrid keeps AppCard optional actions without requiring Activity",
      run: async () => {
        const source = await readSource(
          "components/starred/StarredBotGrid.tsx"
        );
        const card = extractAppCardJsx(source);
        assert(
          !/onActivity=/.test(card),
          "StarredBotGrid does not pass onActivity"
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
