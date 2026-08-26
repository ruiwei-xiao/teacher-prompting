/**
 * Task-local verification for sidebar navigation (task 6.1).
 * Source checks WorkspaceSidebar labels and nav constants wiring.
 *
 * Run: npx tsx scripts/verify-sidebar-nav.ts
 */
import fs from "fs/promises";
import path from "path";
import { MY_SESSIONS_HREF } from "../lib/chat-session-ui/nav";
import { ACTIVITY_HREF } from "../lib/calibration-ui/offering";

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
      name: "MY_SESSIONS_HREF remains /sessions",
      run: () => {
        assertEqual(MY_SESSIONS_HREF, "/sessions", "my sessions href");
      },
    },
    {
      name: "ACTIVITY_HREF remains /activity",
      run: () => {
        assertEqual(ACTIVITY_HREF, "/activity", "calibration hub href");
      },
    },
    {
      name: "sidebar imports My sessions nav constants",
      run: async () => {
        const source = await readSource(
          "components/app-shell/WorkspaceSidebar.tsx"
        );
        assert(
          source.includes('from "@/lib/chat-session-ui/nav"') ||
            source.includes("from '@/lib/chat-session-ui/nav'"),
          "imports @/lib/chat-session-ui/nav"
        );
        assert(
          source.includes("MY_SESSIONS_HREF"),
          "uses MY_SESSIONS_HREF"
        );
        assert(
          source.includes("isMySessionsPath"),
          "uses isMySessionsPath for active state"
        );
      },
    },
    {
      name: "sidebar adds a My sessions Library item",
      run: async () => {
        const source = await readSource(
          "components/app-shell/WorkspaceSidebar.tsx"
        );
        assert(
          source.includes("href={MY_SESSIONS_HREF}") ||
            source.includes("href={ MY_SESSIONS_HREF }"),
          "Link href uses MY_SESSIONS_HREF"
        );
        assert(
          />\s*My sessions\s*</.test(source),
          'visible label is "My sessions"'
        );
        assert(
          source.includes("isMySessionsPath(pathname)") ||
            source.includes("isMySessionsPath( pathname )"),
          "active state uses isMySessionsPath(pathname)"
        );
        const starredIndex = source.indexOf("Starred");
        const mySessionsIndex = source.search(/>\s*My sessions\s*</);
        assert(starredIndex !== -1, "Starred item is still present");
        assert(
          mySessionsIndex > starredIndex,
          "My sessions appears after Starred"
        );
      },
    },
    {
      name: "sidebar relabels calibration to Collaborative activities without changing its route",
      run: async () => {
        const source = await readSource(
          "components/app-shell/WorkspaceSidebar.tsx"
        );
        assert(
          source.includes("ACTIVITY_HREF"),
          "still uses ACTIVITY_HREF"
        );
        assert(
          source.includes("href={ACTIVITY_HREF}") ||
            source.includes("href={ ACTIVITY_HREF }"),
          "calibration Link href is still ACTIVITY_HREF"
        );
        assert(
          source.includes("isCalibrationPath"),
          "still uses isCalibrationPath"
        );
        assert(
          />\s*Collaborative activities\s*</.test(source),
          'visible label is "Collaborative activities"'
        );
        assert(
          !/>\s*Activities\s*</.test(source),
          "no leftover standalone >Activities< label"
        );
      },
    },
    {
      name: "My sessions and Collaborative activities are distinct labels",
      run: async () => {
        const source = await readSource(
          "components/app-shell/WorkspaceSidebar.tsx"
        );
        assert(
          />\s*My sessions\s*</.test(source) &&
            />\s*Collaborative activities\s*</.test(source),
          "both labels are present as distinct Link text"
        );
        assert(
          !source.includes('href={ACTIVITY_HREF}') ||
            source.includes("MY_SESSIONS_HREF"),
          "My sessions uses its own href constant, not ACTIVITY_HREF"
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
