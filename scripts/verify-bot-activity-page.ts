/**
 * Task-local verification for the creator bot activity page (task 5.2).
 * Source checks the server ownership gate and the client master-detail view.
 *
 * Run: npx tsx scripts/verify-bot-activity-page.ts
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

async function main() {
  const checks: Check[] = [
    {
      name: "activityHrefForApp is the stable per-bot activity URL",
      run: () => {
        assertEqual(
          activityHrefForApp("bot-1"),
          "/app/bot-1/activity",
          "activity href"
        );
      },
    },
    {
      name: "page.tsx calls notFound and getAppById with userId",
      run: async () => {
        const source = await readSource("app/app/[appId]/activity/page.tsx");
        assert(
          source.includes('from "next/navigation"') &&
            source.includes("notFound"),
          "imports notFound from next/navigation"
        );
        assert(/\bnotFound\s*\(/.test(source), "calls notFound()");
        assert(
          source.includes('from "@/auth"') && source.includes("auth()"),
          "calls auth()"
        );
        assert(
          source.includes("getAppById"),
          "loads the bot via getAppById"
        );
        assert(
          /getAppById\s*\(\s*appId\s*,\s*userId\s*\)/.test(source),
          "getAppById(appId, userId) ownership filter"
        );
        assert(
          /const\s+userId\s*=/.test(source),
          "derives userId from the session"
        );
        assert(
          !source.includes("SignInPanel"),
          "unauthenticated visitors get not-found, not a sign-in panel"
        );
      },
    },
    {
      name: "page.tsx wraps BotActivityView in AppShell like starred",
      run: async () => {
        const source = await readSource("app/app/[appId]/activity/page.tsx");
        assert(source.includes("AppShell"), "AppShell chrome");
        assert(source.includes("BotActivityView"), "renders BotActivityView");
        assert(
          source.includes("appId") && source.includes("appName") ||
            source.includes("app.name"),
          "passes app id and name into the view"
        );
        assert(
          source.includes("type-display"),
          "type-display heading"
        );
        assert(
          /Activity/.test(source),
          "Activity heading copy"
        );
        assert(
          source.includes("/editor") &&
            (source.includes("`/app/${appId}/editor`") ||
              source.includes("`/app/${app.id}/editor`") ||
              source.includes('"/app/"')),
          "link back to editor"
        );
        assert(
          source.includes("bg-gradient-to-br"),
          "gradient background like starred/activity hub"
        );
        assert(
          !source.includes('"use client"'),
          "activity page is a Server Component"
        );
      },
    },
    {
      name: "BotActivityView uses fetchOwnerSessions and nameMode participant",
      run: async () => {
        const source = await readSource(
          "components/sessions/BotActivityView.tsx"
        );
        assert(
          source.includes('"use client"'),
          "BotActivityView is a Client Component"
        );
        assert(
          source.includes("fetchOwnerSessions"),
          "loads owner sessions via fetchOwnerSessions"
        );
        assert(
          source.includes("fetchTranscript"),
          "loads transcripts via fetchTranscript"
        );
        assert(
          source.includes("SessionList"),
          "composes SessionList"
        );
        assert(
          source.includes("SessionTranscript"),
          "composes SessionTranscript"
        );
        assert(
          /nameMode=["']participant["']/.test(source) ||
            /nameMode=\{\s*["']participant["']\s*\}/.test(source),
          'nameMode="participant"'
        );
        assert(
          source.includes("emptyMessage"),
          "emptyMessage present"
        );
        assert(
          /sessions will appear once the bot is used/i.test(source),
          "empty state explains sessions appear once the bot is used"
        );
        assert(
          source.includes("activityHrefForApp"),
          "uses activityHrefForApp for the stable activity URL"
        );
      },
    },
    {
      name: "BotActivityView offers CSV/JSON downloads and source/date filters",
      run: async () => {
        const source = await readSource(
          "components/sessions/BotActivityView.tsx"
        );
        assert(
          source.includes("activityExportHref"),
          "uses activityExportHref"
        );
        assert(source.includes("Download CSV"), "CSV label");
        assert(source.includes("Download JSON"), "JSON label");
        assert(
          source.includes("ActivityFilters"),
          "renders ActivityFilters"
        );
        assert(
          source.includes("buildActivitySearch"),
          "keeps filters in the activity URL"
        );
        assert(
          source.includes("No sessions match these filters"),
          "filtered empty copy"
        );
        assert(
          source.includes("Shared sessions only"),
          "export is labeled as shared-only"
        );
      },
    },
    {
      name: "Activity filters use a source dropdown and a date-range calendar",
      run: async () => {
        const filters = await readSource(
          "components/sessions/ActivityFilters.tsx"
        );
        const picker = await readSource(
          "components/sessions/DateRangePicker.tsx"
        );
        assert(
          !filters.includes('type="date"'),
          "native date inputs are not the custom-range UI"
        );
        assert(filters.includes("<select"), "source is a dropdown");
        assert(filters.includes("DateRangePicker"), "composes DateRangePicker");
        assert(filters.includes("All sources"), "source: All sources");
        assert(filters.includes("Public chat"), "source: Public chat");
        assert(filters.includes("Editor test"), "source: Editor test");
        assert(!filters.includes("All time"), "no last-N-days presets");
        assert(!filters.includes("7d"), "no 7d preset");
        assert(picker.includes("Select date range"), "empty range copy");
        assert(picker.includes("role=\"dialog\""), "calendar is a dialog");
        assert(
          picker.includes("Select the start date, then the end date"),
          "start-then-end instructions"
        );
        assert(picker.includes("Clear date range"), "clear control");
      },
    },
    {
      name: "BotActivityView opens transcripts at a stable session URL",
      run: async () => {
        const source = await readSource(
          "components/sessions/BotActivityView.tsx"
        );
        assert(
          source.includes("useSearchParams") ||
            source.includes("searchParams"),
          "reads session selection from the URL"
        );
        assert(
          /["']session["']/.test(source),
          "session query param"
        );
        assert(
          source.includes("router.replace") ||
            source.includes("router.push") ||
            source.includes("activityHrefForApp"),
          "updates the activity URL when a session is selected"
        );
        assert(
          !/\bonDelete\b/.test(source) && !/\bonEdit\b/.test(source),
          "no edit/delete affordances"
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
