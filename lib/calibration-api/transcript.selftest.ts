/**
 * Self-test: transcript draft generation (validation + formatting, no live LLM).
 * Run: npx tsx lib/calibration-api/transcript.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { AppConfig } from "@/lib/app-store/types";
import {
  TRANSCRIPT_DRAFT_ROUNDS,
  generateTranscriptDraft,
  transcriptScenarioSummary,
} from "./transcript";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function sampleApp(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    id: "app_1",
    name: "Lab tutor",
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: "sk-test",
    systemPrompt: "Help students plan, do not write the essay.",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

async function main(): Promise<void> {
  assertEqual(TRANSCRIPT_DRAFT_ROUNDS, 3, "draft uses 3 learner turns");
  assert(
    transcriptScenarioSummary("Week 3 lab.").includes("Week 3 lab."),
    "scenario includes the deployment brief"
  );
  assert(
    transcriptScenarioSummary("").includes("typical classroom"),
    "empty brief still has a default scenario"
  );

  assertEqual(
    (await generateTranscriptDraft(null, { sampleAppId: "app_1" })).status,
    401,
    "unauthenticated generate → 401"
  );
  assertEqual(
    (await generateTranscriptDraft("op_1", {})).status,
    400,
    "missing sampleAppId → 400"
  );

  const missing = await generateTranscriptDraft(
    "op_1",
    { sampleAppId: "app_1" },
    { getAppById: async () => null }
  );
  assertEqual(missing.status, 404, "unknown bot → 404");

  const noKey = await generateTranscriptDraft(
    "op_1",
    { sampleAppId: "app_1" },
    { getAppById: async () => sampleApp({ apiKey: "" }) }
  );
  assertEqual(noKey.status, 400, "bot without API key → 400");

  const noPrompt = await generateTranscriptDraft(
    "op_1",
    { sampleAppId: "app_1" },
    { getAppById: async () => sampleApp({ systemPrompt: "   " }) }
  );
  assertEqual(noPrompt.status, 400, "bot without system prompt → 400");

  let seenScenario = "";
  let seenRounds = 0;
  const generated = await generateTranscriptDraft(
    "op_1",
    { sampleAppId: " app_1 ", deploymentBrief: " Week 3 lab. " },
    {
      getAppById: async (id, ownerId) => {
        assertEqual(id, "app_1", "loads the selected bot");
        assertEqual(ownerId, "op_1", "loads the bot as the signed-in owner");
        return sampleApp();
      },
      generateDialogue: async (args) => {
        seenScenario = args.scenarioSummary;
        seenRounds = args.rounds;
        assertEqual(args.baseSystemPrompt, sampleApp().systemPrompt, "uses bot prompt");
        assertEqual(args.purposeLabel, "Scoreable excerpt", "calibration purpose");
        return [
          { role: "assistant", content: "Hi, I am Lab tutor." },
          { role: "user", content: "Can you write my intro?" },
          { role: "assistant", content: "What claim do you want to make?" },
        ];
      },
    }
  );
  assertEqual(generated.status, 200, "mocked generate → 200");
  assert(generated.ok === true, "mocked generate ok");
  if (generated.ok) {
    assertEqual(
      generated.body.transcriptExcerpt,
      "Student: Can you write my intro?\n\nTutor: What claim do you want to make?",
      "returns a Student/Tutor excerpt without the welcome"
    );
  }
  assert(seenScenario.includes("Week 3 lab."), "passes brief into the scenario");
  assertEqual(seenRounds, 3, "requests three learner turns");

  const routePath = path.join(
    process.cwd(),
    "app/api/calibration/offerings/generate-transcript/route.ts"
  );
  const routeSource = await fs.readFile(routePath, "utf8").catch(() => "");
  assert(routeSource.includes("generateTranscriptDraft"), "route calls the handler");
  assert(
    routeSource.includes("maxDuration"),
    "route allows a long dialogue generation"
  );

  if (failures > 0) {
    console.error(`\ntranscript.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("transcript.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("transcript.selftest crashed:", err);
  process.exit(1);
});
