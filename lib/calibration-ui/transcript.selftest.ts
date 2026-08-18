/**
 * Self-test: transcript draft helpers for the activity create form.
 * Run: npx tsx lib/calibration-ui/transcript.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import {
  TRANSCRIPT_GENERATE_API,
  formatTranscriptExcerpt,
  generateTranscriptPostBody,
  parseTranscriptGenerateResponse,
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

async function main(): Promise<void> {
  assertEqual(
    TRANSCRIPT_GENERATE_API,
    "/api/calibration/offerings/generate-transcript",
    "generate posts to the transcript draft API"
  );
  assertEqual(
    generateTranscriptPostBody({
      sampleAppId: " app_1 ",
      deploymentBrief: " Week 3 lab. ",
    }),
    { sampleAppId: "app_1", deploymentBrief: "Week 3 lab." },
    "generate body trims sampleAppId and brief"
  );

  assertEqual(
    formatTranscriptExcerpt([
      { role: "assistant", content: "Hi, I am the tutor." },
      { role: "user", content: "Can you write my intro?" },
      { role: "assistant", content: "What claim do you want to make?" },
    ]),
    "Student: Can you write my intro?\n\nTutor: What claim do you want to make?",
    "formatter skips the welcome and labels Student/Tutor"
  );
  assertEqual(
    formatTranscriptExcerpt([{ role: "assistant", content: "Welcome only" }]),
    "",
    "welcome-only transcript is empty"
  );

  const parsed = parseTranscriptGenerateResponse(200, {
    transcriptExcerpt: "  Student: hi\n\nTutor: hello  ",
  });
  assert(parsed.ok === true, "200 generate is ok");
  if (parsed.ok) {
    assertEqual(
      parsed.transcriptExcerpt,
      "Student: hi\n\nTutor: hello",
      "parse trims the excerpt"
    );
  }
  assert(
    parseTranscriptGenerateResponse(400, { error: "Missing sampleAppId" }).ok ===
      false,
    "400 generate fails"
  );
  assert(
    parseTranscriptGenerateResponse(200, { transcriptExcerpt: "   " }).ok ===
      false,
    "blank excerpt is invalid"
  );

  const helpersPath = path.join(
    process.cwd(),
    "lib/calibration-ui/transcript.ts"
  );
  const formPath = path.join(
    process.cwd(),
    "components/calibration/OfferingCreateForm.tsx"
  );
  const helpersSource = await fs.readFile(helpersPath, "utf8").catch(() => "");
  const formSource = await fs.readFile(formPath, "utf8").catch(() => "");

  assert(helpersSource.length > 0, "transcript helpers exist");
  assert(
    !helpersSource.includes("calibration-engine") &&
      !helpersSource.includes("calibration-store"),
    "transcript helpers do not import engine/store"
  );
  assert(
    formSource.includes("TRANSCRIPT_GENERATE_API") ||
      formSource.includes("/api/calibration/offerings/generate-transcript"),
    "create form posts to the transcript draft API"
  );
  assert(
    formSource.includes("Generate draft"),
    "create form offers Generate draft"
  );
  const loadEffect = formSource.match(
    /useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/
  );
  assert(Boolean(loadEffect), "create form loads bots in an effect");
  assert(
    Boolean(loadEffect && !loadEffect[0].includes("TRANSCRIPT_GENERATE_API")),
    "create form does not auto-generate on load"
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
