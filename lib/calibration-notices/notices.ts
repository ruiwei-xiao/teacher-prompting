/**
 * Deduplicated calibration activity notices (Task 3.3).
 * Resend when RESEND_API_KEY is set; otherwise console + .data log.
 * Workspace educator-invite recording is a separate path and is not used here (13.4).
 */
import fs from "fs/promises";
import path from "path";
import { Resend } from "resend";
import { getUserById } from "@/lib/auth/user-store";
import {
  hasNotice as storeHasNotice,
  recordNotice as storeRecordNotice,
} from "../calibration-store/store";
import type {
  NoticeChannel,
  NoticeKind,
  NoticeRecord,
  NoticeSpec,
} from "../calibration-store/types";

export type NoticeSendResult = {
  sent: boolean;
  deduped: boolean;
  channel: NoticeChannel;
};

export interface NoticeService {
  send(spec: NoticeSpec): Promise<NoticeSendResult>;
}

export type MailSender = (input: {
  to: string;
  from: string;
  subject: string;
  text: string;
}) => Promise<void>;

export type RecordNoticeFn = (notice: NoticeRecord) => Promise<boolean>;
export type HasNoticeFn = (dedupeKey: string) => Promise<boolean>;
export type ResolveEmailFn = (userId: string) => Promise<string | null>;

export type NoticeServiceDeps = {
  recordNotice?: RecordNoticeFn;
  hasNotice?: HasNoticeFn;
  sendMail?: MailSender;
  resolveEmail?: ResolveEmailFn;
};

const DEFAULT_LOG_FILE = path.join(process.cwd(), ".data", "calibration-notices.log");

const NOTICE_COPY: Record<NoticeKind, { subject: string; summary: string }> = {
  team_formed: {
    subject: "Your team activity is ready",
    summary: "Your group has formed and the team space is ready.",
  },
  your_turn: {
    subject: "It is your turn in the team activity",
    summary: "The activity is waiting on your current turn.",
  },
  targeted_prompt: {
    subject: "A teammate needs your take",
    summary: "There is a targeted prompt waiting for you in the team space.",
  },
  nudge: {
    subject: "A reminder for your team activity step",
    summary: "A per-person reminder is due for your current step.",
  },
  scores_revealed: {
    subject: "Team scores are now visible",
    summary: "Held scores have been revealed in the team space.",
  },
  finalized: {
    subject: "Your team rubric is finalized",
    summary: "The activity is finalized and the team rubric is locked.",
  },
  queue_ping: {
    subject: "Are you still waiting for a team?",
    summary: "Please re-confirm that you are still interested in joining a team.",
  },
  queue_expired: {
    subject: "You are no longer waiting for a team",
    summary: "Your place in the queue expired after missed re-confirmation notices.",
  },
  manual_match: {
    subject: "You have been matched into a team",
    summary: "An instructor matched you into a team and the space is ready.",
  },
};

function noticeLogPath(): string {
  return process.env.CALIBRATION_NOTICES_LOG || DEFAULT_LOG_FILE;
}

function selectChannel(deps: NoticeServiceDeps): NoticeChannel {
  if (deps.sendMail || process.env.RESEND_API_KEY) {
    return "email";
  }
  return "console";
}

function renderText(spec: NoticeSpec): string {
  const copy = NOTICE_COPY[spec.kind];
  return `${copy.summary}\n\nOpen: ${spec.deepLink}`;
}

function renderFallbackLine(spec: NoticeSpec): string {
  return `[calibration-notice] kind=${spec.kind} userId=${spec.userId} deepLink=${spec.deepLink} — ${NOTICE_COPY[spec.kind].summary}`;
}

async function writeFallbackLog(line: string): Promise<void> {
  const logPath = noticeLogPath();
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${line}\n`, "utf-8");
  console.log(line);
}

function createResendMailer(apiKey: string): MailSender {
  const resend = new Resend(apiKey);
  return async (input) => {
    const { error } = await resend.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    if (error) {
      throw new Error(error.message);
    }
  };
}

async function defaultResolveEmail(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  return user?.email ?? null;
}

export function createNoticeService(deps: NoticeServiceDeps = {}): NoticeService {
  const deliveredKeys = new Set<string>();

  return {
    async send(spec: NoticeSpec): Promise<NoticeSendResult> {
      const channel = selectChannel(deps);
      const recordNotice = deps.recordNotice ?? storeRecordNotice;
      const hasNotice = deps.hasNotice ?? storeHasNotice;

      if (deliveredKeys.has(spec.dedupeKey) || (await hasNotice(spec.dedupeKey))) {
        return { sent: false, deduped: true, channel };
      }

      const copy = NOTICE_COPY[spec.kind];
      const text = renderText(spec);
      const notice: NoticeRecord = {
        offeringId: spec.offeringId ?? "",
        teamId: spec.teamId ?? null,
        userId: spec.userId,
        kind: spec.kind,
        dedupeKey: spec.dedupeKey,
        channel,
      };

      const persistAfterDelivery = async (
        deliveredChannel: NoticeChannel
      ): Promise<NoticeSendResult> => {
        const recorded = await recordNotice({ ...notice, channel: deliveredChannel });
        deliveredKeys.add(spec.dedupeKey);
        if (!recorded) {
          return { sent: false, deduped: true, channel: deliveredChannel };
        }
        return { sent: true, deduped: false, channel: deliveredChannel };
      };

      if (channel === "console") {
        await writeFallbackLog(renderFallbackLine(spec));
        return persistAfterDelivery("console");
      }

      const resolveEmail = deps.resolveEmail ?? defaultResolveEmail;
      const to = await resolveEmail(spec.userId);
      const from = process.env.CALIBRATION_EMAIL_FROM?.trim() ?? "";
      const sendMail =
        deps.sendMail ??
        (process.env.RESEND_API_KEY
          ? createResendMailer(process.env.RESEND_API_KEY)
          : undefined);

      if (!sendMail || !to || !from) {
        await writeFallbackLog(renderFallbackLine(spec));
        return persistAfterDelivery("console");
      }

      try {
        await sendMail({ to, from, subject: copy.subject, text });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`calibration-notices: email send failed (${reason})`);
        return { sent: false, deduped: false, channel: "email" };
      }

      return persistAfterDelivery("email");
    },
  };
}

export const notices: NoticeService = createNoticeService();
