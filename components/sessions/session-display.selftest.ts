/**
 * Self-test: SessionNameMode "workspace" list labels (Req 3.2).
 * Run: npx tsx components/sessions/session-display.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import type { SessionSummary } from "@/lib/chat-session-store/types";
import {
  ANONYMOUS_LABEL,
  BOT_VERSION_UNAVAILABLE_LABEL,
  formatSessionStartTime,
  sessionBadges,
  sessionDisplayName,
  sessionListSecondaryText,
  sessionSurfaceBadge,
  startingVersionLabel,
} from "./session-display";

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

function sampleSummary(
  overrides: Partial<SessionSummary> = {}
): SessionSummary {
  return {
    id: "sess-1",
    appId: "bot-1",
    appName: "Tutor",
    ownerId: "owner-1",
    participantId: "user-1",
    participantName: "Ada",
    surface: "public",
    shared: true,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:05:00.000Z",
    messageCount: 4,
    appExists: true,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const named = sampleSummary();
  const anonymous = sampleSummary({
    participantName: null,
    participantId: null,
  });
  const blank = sampleSummary({ participantName: "   " });
  const editorTest = sampleSummary({ surface: "editor-test" });

  assertEqual(
    sessionDisplayName(named, "workspace"),
    "Tutor",
    "workspace mode primary name is the bot name"
  );
  assertEqual(
    sessionDisplayName(named, "bot"),
    "Tutor",
    "bot mode is unchanged"
  );
  assertEqual(
    sessionDisplayName(named, "participant"),
    "Ada",
    "participant mode is unchanged"
  );

  assertEqual(ANONYMOUS_LABEL, "Anonymous", "Anonymous label copy");
  assertEqual(
    sessionListSecondaryText(named, "workspace"),
    `Ada · ${formatSessionStartTime(named.createdAt)}`,
    "workspace secondary is participant · start time"
  );
  assertEqual(
    sessionListSecondaryText(anonymous, "workspace"),
    `Anonymous · ${formatSessionStartTime(anonymous.createdAt)}`,
    "workspace secondary uses Anonymous when participant is missing"
  );
  assertEqual(
    sessionListSecondaryText(blank, "workspace"),
    `Anonymous · ${formatSessionStartTime(blank.createdAt)}`,
    "workspace secondary uses Anonymous for blank participant names"
  );
  assertEqual(
    sessionListSecondaryText(named, "bot"),
    formatSessionStartTime(named.createdAt),
    "bot mode secondary stays start time only"
  );
  assertEqual(
    sessionListSecondaryText(named, "participant"),
    formatSessionStartTime(named.createdAt),
    "participant mode secondary stays start time only"
  );

  assertEqual(
    sessionBadges(named, "workspace"),
    ["Public chat"],
    "workspace mode keeps the public chat surface badge"
  );
  assertEqual(
    sessionBadges(editorTest, "workspace"),
    ["Editor test"],
    "workspace mode keeps the editor-test surface badge"
  );
  assertEqual(
    sessionSurfaceBadge("public"),
    "Public chat",
    "public surface badge copy"
  );
  assertEqual(
    sessionSurfaceBadge("editor-test"),
    "Editor test",
    "editor-test surface badge copy"
  );

  const versionCreatedAt = "2026-08-20T15:30:00.000Z";
  const sessionStartedAt = "2026-08-24T12:00:00.000Z";
  const formattedVersionTime = formatSessionStartTime(versionCreatedAt);

  assertEqual(
    startingVersionLabel({
      configVersionId: "ver-1",
      configVersionCreatedAt: versionCreatedAt,
    }),
    `Bot version from ${formattedVersionTime}`,
    "resolved starting version uses the version created time"
  );
  assert(
    startingVersionLabel({
      configVersionId: "ver-1",
      configVersionCreatedAt: versionCreatedAt,
    }) !== `Bot version from ${formatSessionStartTime(sessionStartedAt)}`,
    "version label does not use the session start time"
  );
  assertEqual(
    startingVersionLabel({ configVersionId: null, configVersionCreatedAt: null }),
    null,
    "null starting version omits the label"
  );
  assertEqual(
    startingVersionLabel({ configVersionCreatedAt: versionCreatedAt }),
    null,
    "absent starting version omits the label"
  );
  assertEqual(
    startingVersionLabel({
      configVersionId: "   ",
      configVersionCreatedAt: versionCreatedAt,
    }),
    null,
    "blank starting version omits the label"
  );
  assertEqual(
    startingVersionLabel({
      configVersionId: "ver-missing",
      configVersionCreatedAt: null,
    }),
    BOT_VERSION_UNAVAILABLE_LABEL,
    "unresolved starting version is unavailable"
  );
  assertEqual(
    startingVersionLabel({
      configVersionId: "ver-missing",
      configVersionCreatedAt: "   ",
    }),
    BOT_VERSION_UNAVAILABLE_LABEL,
    "blank created time is unavailable"
  );
  assertEqual(BOT_VERSION_UNAVAILABLE_LABEL, "Bot version unavailable", "unavailable copy");
  assert(
    !BOT_VERSION_UNAVAILABLE_LABEL.includes(formattedVersionTime),
    "unavailable label does not invent a time"
  );

  const listPath = path.join(
    process.cwd(),
    "components/sessions/SessionList.tsx"
  );
  const listSource = await fs.readFile(listPath, "utf8");
  assert(
    listSource.includes("sessionListSecondaryText"),
    "SessionList renders the workspace participant subtitle via sessionListSecondaryText"
  );

  const transcriptSource = await fs.readFile(
    path.join(process.cwd(), "components/sessions/SessionTranscript.tsx"),
    "utf8"
  );
  assert(
    transcriptSource.includes("startingVersionLabel"),
    "SessionTranscript renders the starting version label"
  );
  assert(
    !transcriptSource.includes("message.configVersion") &&
      !transcriptSource.includes("message.version"),
    "transcript does not label each message with a version"
  );

  const activitySource = await fs.readFile(
    path.join(process.cwd(), "components/sessions/BotActivityView.tsx"),
    "utf8"
  );
  assert(
    activitySource.includes("configVersionCreatedAt"),
    "owner activity passes the version created time"
  );
  assert(
    activitySource.includes("activityExportHref"),
    "owner activity downloads stay on the existing export links"
  );

  const exportSource = await fs.readFile(
    path.join(process.cwd(), "lib/chat-session-api/export.ts"),
    "utf8"
  );
  assert(
    !exportSource.includes("configVersionId") &&
      !exportSource.includes("configVersionCreatedAt") &&
      !exportSource.includes("Bot version"),
    "activity download columns do not gain a version field"
  );

  if (failures > 0) {
    console.error(`\nsession-display.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("session-display.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("session-display.selftest crashed:", err);
  process.exit(1);
});
