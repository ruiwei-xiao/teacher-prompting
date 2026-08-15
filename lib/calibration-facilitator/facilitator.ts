/**
 * LLM-worded facilitator posts with scripted fallback (Task 3.2).
 * Presentation only — never gates phase advancement (11.5).
 *
 * sendChat is injected so tests can stub failure; production uses the
 * existing adapter with the offering's provider/model.
 */
import { sendChat } from "@/lib/ai/providers";
import type { SupportedProvider } from "@/lib/app-store/types";
import type { DocSnapshot, TeamStateRecord } from "../calibration-store/types";
import {
  renderScripted,
  type ScriptedKind,
  type TemplateContext,
} from "./templates";

export type SendChatFn = typeof sendChat;

export type TeamContext = TemplateContext & {
  aiProvider: string;
  aiModel: string;
  apiKey: string;
};

export type DisagreementExchange = {
  userId: string;
  evidence: string;
  criterionKey?: string;
  scorerUserId?: string;
};

export interface FacilitatorService {
  renderScripted(kind: ScriptedKind, ctx: TemplateContext): string;
  revoice(critiqueText: string, ctx: TeamContext): Promise<string>;
  askFollowUp(exchange: DisagreementExchange, ctx: TeamContext): Promise<string>;
  commentOnDocument(
    snapshot: DocSnapshot,
    ctx: TeamContext
  ): Promise<string | null>;
  synthesizeFinal(
    state: TeamStateRecord,
    rubricSnapshot: string,
    chatExcerpt: string,
    ctx: TeamContext
  ): Promise<string>;
}

const SUPPORTED_PROVIDERS: readonly SupportedProvider[] = [
  "openai",
  "google",
  "anthropic",
];

function asSupportedProvider(value: string): SupportedProvider | undefined {
  return SUPPORTED_PROVIDERS.find((provider) => provider === value);
}

function logFallback(kind: ScriptedKind, ctx: TeamContext, reason: string): void {
  console.error(
    `calibration-facilitator: sendChat failed (provider=${ctx.aiProvider} model=${ctx.aiModel}); fallback=${kind} (${reason})`
  );
}

async function wordWithFallback(
  sendChatFn: SendChatFn,
  ctx: TeamContext,
  fallbackKind: ScriptedKind,
  fallbackCtx: TemplateContext,
  system: string,
  userMessage: string
): Promise<string> {
  const fallback = () => renderScripted(fallbackKind, fallbackCtx);
  const provider = asSupportedProvider(ctx.aiProvider);
  if (provider === undefined) {
    logFallback(fallbackKind, ctx, "unsupported provider");
    return fallback();
  }
  try {
    const text = await sendChatFn({
      provider,
      model: ctx.aiModel,
      apiKey: ctx.apiKey,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (trimmed.length === 0) {
      logFallback(fallbackKind, ctx, "empty response");
      return fallback();
    }
    return trimmed;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "threw";
    logFallback(fallbackKind, ctx, reason);
    return fallback();
  }
}

const REVOICE_SYSTEM =
  "You are the facilitator in a rubric-calibration team chat. Revoice the learner's critique in natural language so the team can hear it clearly. Do not decide whether a phase may advance. Do not include numeric score values.";

const FOLLOW_UP_SYSTEM =
  "You are the facilitator in a rubric-calibration team chat. Revoice the stated evidence and ask the other party whether their reading changes. Do not decide whether a phase may advance. Do not include numeric score values.";

const DOC_COMMENT_SYSTEM =
  "You are the facilitator in a rubric-calibration team chat. Read the latest shared-document snapshot and comment in the group chat. Quote the snapshot. Flag vague or unmeasurable criteria and missing one-line rationales. Do not decide whether a phase may advance. Do not include numeric score values.";

const SYNTHESIZE_SYSTEM =
  "You are the facilitator in a rubric-calibration team chat. The group-timeout clock expired. Auto-synthesize a best-available final rubric from the existing rubric snapshot and discussion excerpt, then lock it. Label unresolved criteria as unresolved. Do not invent criteria that are not supported by the collected work. Do not include numeric score values.";

export function createFacilitatorService(
  sendChatFn: SendChatFn = sendChat
): FacilitatorService {
  return {
    renderScripted,

    revoice(critiqueText: string, ctx: TeamContext): Promise<string> {
      return wordWithFallback(
        sendChatFn,
        ctx,
        "revoice",
        ctx,
        REVOICE_SYSTEM,
        `Revoice this critique for the team:\n\n${critiqueText}`
      );
    },

    askFollowUp(
      exchange: DisagreementExchange,
      ctx: TeamContext
    ): Promise<string> {
      const criterion = exchange.criterionKey ?? "this criterion";
      return wordWithFallback(
        sendChatFn,
        ctx,
        "follow_up",
        ctx,
        FOLLOW_UP_SYSTEM,
        `A flagged-criterion exchange is underway on ${criterion}. Stated evidence:\n\n${exchange.evidence}\n\nAsk ${exchange.userId} whether that evidence changes their reading.`
      );
    },

    commentOnDocument(
      snapshot: DocSnapshot,
      ctx: TeamContext
    ): Promise<string | null> {
      const fallbackCtx: TemplateContext = {
        ...ctx,
        snapshotText: snapshot.snapshotText,
        docKind: snapshot.docKind,
      };
      return wordWithFallback(
        sendChatFn,
        ctx,
        "doc_comment",
        fallbackCtx,
        DOC_COMMENT_SYSTEM,
        `Latest ${snapshot.docKind} snapshot (quote this text):\n\n${snapshot.snapshotText}\n\nComment on vague or unmeasurable criteria and missing rationales.`
      );
    },

    synthesizeFinal(
      state: TeamStateRecord,
      rubricSnapshot: string,
      chatExcerpt: string,
      ctx: TeamContext
    ): Promise<string> {
      const unresolved =
        Array.isArray(ctx.unresolved) && ctx.unresolved.length > 0
          ? ctx.unresolved
          : state.flaggedCriteria;
      const fallbackCtx: TemplateContext = { ...ctx, unresolved };
      const unresolvedLabel =
        unresolved.length > 0 ? unresolved.join(", ") : "none listed";
      return wordWithFallback(
        sendChatFn,
        ctx,
        "auto_synthesize",
        fallbackCtx,
        SYNTHESIZE_SYSTEM,
        `Produce a best-available final rubric and lock it. Label unresolved criteria as unresolved: ${unresolvedLabel}.\n\nRubric snapshot:\n${rubricSnapshot}\n\nDiscussion excerpt:\n${chatExcerpt}`
      );
    },
  };
}

export const FacilitatorService = createFacilitatorService();
