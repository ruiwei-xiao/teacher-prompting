/**
 * Runtime self-test for deduplicated calibration notices (Task 3.3).
 * Forces JSON store mode and the console/.data fallback (no Resend key).
 *
 * Run: npx tsx lib/calibration-notices/notices.selftest.ts
 */
import fs from "fs/promises";
import path from "path";
import { NOTICE_KINDS, type NoticeKind, type NoticeRecord, type NoticeSpec } from "../calibration-store/types";
import type { MailSender, NoticeService } from "./notices";

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

function hasScoreNumbers(text: string): boolean {
  return (
    /\b(?:score|scores|scored|rating)\b[\s\S]{0,40}\b[1-5]\b/i.test(text) ||
    /\b[1-5]\b[\s\S]{0,40}\b(?:score|scores|scored|rating)\b/i.test(text) ||
    /\b[1-5]\s*\/\s*5\b/.test(text)
  );
}

function specFor(
  kind: NoticeKind,
  dedupeKey: string,
  extras: Partial<NoticeSpec> = {}
): NoticeSpec {
  const queueKind = kind === "queue_ping" || kind === "queue_expired";
  return {
    kind,
    userId: "user-alice",
    dedupeKey,
    deepLink: queueKind
      ? "/activity/offering-alpha"
      : "/activity/offering-alpha/team/team-alpha",
    offeringId: "offering-alpha",
    teamId: queueKind ? undefined : "team-alpha",
    ...extras,
  };
}

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.RESEND_API_KEY;

  const tempDir = path.join(process.cwd(), ".data", "calibration-notices-selftest");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  const dataFile = path.join(tempDir, "calibration.json");
  const logFile = path.join(tempDir, "calibration-notices.log");
  process.env.CALIBRATION_DATA_FILE = dataFile;
  process.env.CALIBRATION_NOTICES_LOG = logFile;
  process.env.CALIBRATION_EMAIL_FROM = "calibration@example.com";

  const { hasNotice, recordNotice } = await import("../calibration-store/store");
  const { createNoticeService } = await import("./notices");

  try {
    assert(typeof hasNotice === "function", "store exports hasNotice for non-claiming peek");

    const fallback = createNoticeService({ hasNotice, recordNotice });

    const ping = specFor("queue_ping", "offering-alpha:user-alice:queue_ping:first");
    const firstFallback = await fallback.send(ping);
    assertEqual(
      firstFallback,
      { sent: true, deduped: false, channel: "console" },
      "fallback send without RESEND_API_KEY uses the console channel (2.3, 13.2)"
    );

    const secondFallback = await fallback.send(ping);
    assertEqual(
      secondFallback,
      { sent: false, deduped: true, channel: "console" },
      "same dedupeKey is recorded once and the second send is skipped"
    );

    const logAfterDedupe = await fs.readFile(logFile, "utf-8");
    const fallbackLines = logAfterDedupe
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    assertEqual(
      fallbackLines.length,
      1,
      "fallback path delivers exactly once for a repeated dedupe key"
    );
    assert(
      fallbackLines[0]!.includes("queue_ping"),
      "fallback log line includes the notice kind"
    );
    assert(
      fallbackLines[0]!.includes("/activity/offering-alpha"),
      "fallback log line includes the queue deep link (13.3)"
    );
    assert(
      !hasScoreNumbers(fallbackLines[0]!),
      "fallback log never includes numeric score values (15.3)"
    );

    const deliveries: Array<{ to: string; from: string; subject: string; text: string }> =
      [];
    const order: string[] = [];
    const emailService = createNoticeService({
      recordNotice: async (notice: NoticeRecord) => {
        order.push("record");
        return recordNotice(notice);
      },
      sendMail: (async (mail) => {
        order.push("send");
        deliveries.push(mail);
      }) satisfies MailSender,
      resolveEmail: async () => "alice@example.com",
    });

    const formed = specFor("team_formed", "team-alpha:user-alice:team_formed");
    const firstEmail = await emailService.send(formed);
    assertEqual(
      firstEmail,
      { sent: true, deduped: false, channel: "email" },
      "injected mail sender uses the email channel (5.1, 13.1)"
    );
    const secondEmail = await emailService.send(formed);
    assertEqual(
      secondEmail,
      { sent: false, deduped: true, channel: "email" },
      "injected mail path also dedupes before send"
    );
    assertEqual(deliveries.length, 1, "same dedupeKey produces exactly one email delivery");
    assertEqual(order, ["send", "record"], "recordNotice runs only after successful sendMail");
    assertEqual(deliveries[0]?.to, "alice@example.com", "email goes to the account address (13.1)");
    assertEqual(
      deliveries[0]?.from,
      "calibration@example.com",
      "email uses CALIBRATION_EMAIL_FROM"
    );
    assert(
      (deliveries[0]?.text ?? "").includes("/activity/offering-alpha/team/team-alpha"),
      "email body includes the team-space deep link (13.3)"
    );
    assert(
      (deliveries[0]?.text ?? "").includes("team_formed") ||
        /team|group|formed|ready/i.test(deliveries[0]?.text ?? ""),
      "team_formed email describes formation without scores (5.1)"
    );
    assert(
      !hasScoreNumbers(deliveries[0]?.text ?? "") &&
        !hasScoreNumbers(deliveries[0]?.subject ?? ""),
      "email body and subject never include numeric score values"
    );

    const twoInstanceDeliveries: Array<{
      to: string;
      from: string;
      subject: string;
      text: string;
    }> = [];
    const twoInstanceOrder: string[] = [];
    const sharedStore = {
      hasNotice,
      recordNotice: async (notice: NoticeRecord) => {
        twoInstanceOrder.push("record");
        return recordNotice(notice);
      },
      sendMail: (async (mail: {
        to: string;
        from: string;
        subject: string;
        text: string;
      }) => {
        twoInstanceOrder.push("send");
        twoInstanceDeliveries.push(mail);
      }) satisfies MailSender,
      resolveEmail: async () => "alice@example.com",
    };
    const firstInstance = createNoticeService(sharedStore);
    const secondInstance = createNoticeService(sharedStore);
    const twoInstanceSpec = specFor(
      "nudge",
      "team-alpha:user-alice:nudge:two-instance"
    );
    const firstInstanceSend = await firstInstance.send(twoInstanceSpec);
    assertEqual(
      firstInstanceSend,
      { sent: true, deduped: false, channel: "email" },
      "first NoticeService instance delivers a new store-backed key"
    );
    const secondInstanceSend = await secondInstance.send(twoInstanceSpec);
    assertEqual(
      secondInstanceSend,
      { sent: false, deduped: true, channel: "email" },
      "second NoticeService instance peeks via store hasNotice with empty in-memory deliveredKeys"
    );
    assertEqual(
      twoInstanceDeliveries.length,
      1,
      "two instances sharing store hasNotice/recordNotice produce exactly one delivery"
    );
    assertEqual(
      twoInstanceOrder,
      ["send", "record"],
      "the second instance does not send or record after a store-backed peek hit"
    );

    const raceDeliveries: Array<{ to: string; from: string; subject: string; text: string }> =
      [];
    let claimed = false;
    const raceDeps = {
      hasNotice: async () => false,
      recordNotice: async () => {
        if (claimed) {
          return false;
        }
        claimed = true;
        return true;
      },
      sendMail: (async (mail: {
        to: string;
        from: string;
        subject: string;
        text: string;
      }) => {
        raceDeliveries.push(mail);
      }) satisfies MailSender,
      resolveEmail: async () => "alice@example.com",
    };
    const raceFirst = createNoticeService(raceDeps);
    const raceSecond = createNoticeService(raceDeps);
    const raceSpec = specFor("finalized", "team-alpha:user-alice:finalized:race");
    const raceFirstResult = await raceFirst.send(raceSpec);
    const raceSecondResult = await raceSecond.send(raceSpec);
    assertEqual(
      raceFirstResult,
      { sent: true, deduped: false, channel: "email" },
      "first racer claims the key after a successful send"
    );
    assertEqual(
      raceSecondResult,
      { sent: false, deduped: true, channel: "email" },
      "recordNotice false after a duplicate send is already-delivered, not sent:true"
    );

    const retryDeliveries: Array<{ to: string; from: string; subject: string; text: string }> =
      [];
    const retryRecorded: string[] = [];
    let mailAttempts = 0;
    const retryService = createNoticeService({
      recordNotice: async (notice: NoticeRecord) => {
        retryRecorded.push(notice.dedupeKey);
        return recordNotice(notice);
      },
      sendMail: async (mail) => {
        mailAttempts += 1;
        if (mailAttempts === 1) {
          throw new Error("resend 500");
        }
        retryDeliveries.push(mail);
      },
      resolveEmail: async () => "alice@example.com",
    });
    const retrySpec = specFor("your_turn", "team-alpha:user-alice:your_turn:retry");
    const failedSend = await retryService.send(retrySpec);
    assertEqual(
      failedSend,
      { sent: false, deduped: false, channel: "email" },
      "sendMail throw returns sent:false and does not mark the notice deduped"
    );
    assertEqual(retryRecorded, [], "failed send does not claim the dedupe key");
    assertEqual(retryDeliveries.length, 0, "failed send produces zero deliveries");
    const retriedSend = await retryService.send(retrySpec);
    assertEqual(
      retriedSend,
      { sent: true, deduped: false, channel: "email" },
      "a later send with the same dedupeKey still delivers after send failure"
    );
    assertEqual(mailAttempts, 2, "sendMail is invoked again after a failed attempt");
    assertEqual(retryDeliveries.length, 1, "retry after send failure produces exactly one delivery");
    assertEqual(
      retryRecorded,
      [retrySpec.dedupeKey],
      "dedupe key is recorded only after successful delivery"
    );

    const kindsService = createNoticeService({ recordNotice });
    for (const kind of NOTICE_KINDS) {
      const result = await kindsService.send(
        specFor(kind, `all-kinds:${kind}`)
      );
      assert(
        result.sent === true && result.deduped === false && result.channel === "console",
        `${kind} can be sent through the fallback path`
      );
    }

    const allKindsLog = await fs.readFile(logFile, "utf-8");
    for (const kind of NOTICE_KINDS) {
      assert(
        allKindsLog.includes(kind),
        `fallback log records a readable entry for ${kind}`
      );
    }
    assert(
      !hasScoreNumbers(allKindsLog),
      "no notice kind writes numeric score values into the fallback log"
    );

    const service: NoticeService = fallback;
    assert(typeof service.send === "function", "NoticeService exposes send");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nnotices.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("notices.selftest: all assertions passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
