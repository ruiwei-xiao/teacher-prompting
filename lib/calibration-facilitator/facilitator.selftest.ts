/**
 * Runtime self-test for LLM-worded facilitation with scripted fallback (Task 3.2).
 *
 * Run: npx tsx lib/calibration-facilitator/facilitator.selftest.ts
 */
import type { ChatMsg } from "@/lib/ai/providers";
import type { DocSnapshot, TeamStateRecord } from "../calibration-store/types";
import { renderScripted } from "./templates";
import {
  createFacilitatorService,
  type DisagreementExchange,
  type SendChatFn,
  type TeamContext,
} from "./facilitator";

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

type CapturedSendChat = {
  provider: string;
  model: string;
  apiKey: string;
  system?: string;
  messages: ChatMsg[];
};

const CTX: TeamContext = {
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
  apiKey: "test-key",
  userId: "u-bob",
  presenterUserId: "u-alice",
  memberUserIds: ["u-alice", "u-bob", "u-cara"],
  unresolved: ["clarity"],
  criterionKey: "clarity",
  scorerUserId: "u-alice",
  displayNames: {
    "u-alice": "Alice",
    "u-bob": "Bob",
    "u-cara": "Cara",
  },
};

const SNAPSHOT: DocSnapshot = {
  teamId: "team-1",
  docKind: "rubric",
  snapshotText:
    "Clarity: the bot should be clear. Evidence: students cite sources.",
  updatedAt: "2026-08-15T00:00:00.000Z",
  updatedBy: "u-alice",
};

const STATE: TeamStateRecord = {
  phase: "consensus",
  round: 3,
  presenterIndex: 2,
  perPersonDeadlines: [],
  groupDeadline: "2026-08-29T00:00:00.000Z",
  flaggedCriteria: ["clarity"],
  absenceStepKeys: [],
  agreementSets: { merge_complete: [], final_consensus: [] },
  memberUserIds: ["u-alice", "u-bob", "u-cara"],
  respondedUserIds: [],
  critiqueStage: "critic_response",
};

const EXCHANGE: DisagreementExchange = {
  userId: "u-bob",
  scorerUserId: "u-alice",
  criterionKey: "clarity",
  evidence: "The transcript never asked a follow-up question.",
};

const RUBRIC_SNAPSHOT =
  "Clarity: one-line rationale missing. Evidence: students cite sources.";
const CHAT_EXCERPT = "Alice: I scored clarity lower because the bot hedged.";
const CRITIQUE = "The sample rubric never says how to measure clarity.";

function promptBlob(captured: CapturedSendChat | undefined): string {
  if (captured === undefined) {
    return "";
  }
  const messageText = captured.messages
    .map((message) => message.content)
    .join("\n");
  return `${captured.system ?? ""}\n${messageText}`;
}

function throwingSendChat(): SendChatFn {
  return async () => {
    throw new Error("provider down");
  };
}

function textSendChat(
  text: string,
  sink?: { last?: CapturedSendChat }
): SendChatFn {
  return async (args) => {
    if (sink) {
      sink.last = {
        provider: args.provider,
        model: args.model,
        apiKey: args.apiKey,
        system: args.system,
        messages: args.messages,
      };
    }
    return text;
  };
}

async function callEveryMethod(
  sendChat: SendChatFn
): Promise<{
  revoice: string;
  followUp: string;
  comment: string | null;
  synthesis: string;
}> {
  const service = createFacilitatorService(sendChat);
  return {
    revoice: await service.revoice(CRITIQUE, CTX),
    followUp: await service.askFollowUp(EXCHANGE, CTX),
    comment: await service.commentOnDocument(SNAPSHOT, CTX),
    synthesis: await service.synthesizeFinal(
      STATE,
      RUBRIC_SNAPSHOT,
      CHAT_EXCERPT,
      CTX
    ),
  };
}

async function main(): Promise<void> {
  const failing = await callEveryMethod(throwingSendChat());

  assert(
    typeof failing.revoice === "string" && failing.revoice.trim().length > 0,
    "revoice falls back to a non-empty scripted string when sendChat throws"
  );
  assert(
    typeof failing.followUp === "string" && failing.followUp.trim().length > 0,
    "askFollowUp falls back to a non-empty scripted string when sendChat throws"
  );
  assert(
    typeof failing.comment === "string" && failing.comment.trim().length > 0,
    "commentOnDocument falls back to a non-empty scripted string when sendChat throws"
  );
  assert(
    typeof failing.synthesis === "string" && failing.synthesis.trim().length > 0,
    "synthesizeFinal falls back to a non-empty scripted string when sendChat throws"
  );

  assertEqual(
    failing.revoice,
    renderScripted("revoice", CTX),
    "revoice fallback matches the revoice template (6.4, 11.3)"
  );
  assertEqual(
    failing.followUp,
    renderScripted("follow_up", CTX),
    "askFollowUp fallback matches the follow_up template (9.4)"
  );
  assertEqual(
    failing.synthesis,
    renderScripted("auto_synthesize", CTX),
    "synthesizeFinal fallback matches auto_synthesize for group-timeout lock (10.3)"
  );
  assert(
    /unresolved/i.test(failing.synthesis) && failing.synthesis.includes("clarity"),
    "auto-lock synthesis fallback labels unresolved criteria (10.3)"
  );
  assert(
    /vague|unmeasurable|rationale/i.test(failing.comment ?? ""),
    "doc-comment fallback flags vague criteria or missing rationale (7.1, 11.4)"
  );
  assert(
    (failing.comment ?? "").includes(SNAPSHOT.snapshotText) ||
      /snapshot/i.test(failing.comment ?? ""),
    "doc-comment fallback stays document-aware (11.4)"
  );

  const empty = await callEveryMethod(textSendChat("   "));
  assertEqual(
    empty.revoice,
    renderScripted("revoice", CTX),
    "empty sendChat text falls back to scripted revoice without throwing"
  );
  assertEqual(
    empty.followUp,
    renderScripted("follow_up", CTX),
    "empty sendChat text falls back to scripted follow_up without throwing"
  );
  assert(
    typeof empty.comment === "string" && empty.comment.trim().length > 0,
    "empty sendChat text still returns a scripted doc comment"
  );
  assertEqual(
    empty.synthesis,
    renderScripted("auto_synthesize", CTX),
    "empty sendChat text falls back to scripted auto_synthesize without throwing"
  );

  const llmRevoice = "Here is a recap of the critique about measurable clarity.";
  const llmFollowUp =
    "Alice cited the missing follow-up. Bob, does that change your reading?";
  const llmComment =
    'The line "Clarity: the bot should be clear" is not measurable.';
  const llmSynthesis =
    "Best-available lock: keep Evidence; label Clarity unresolved.";

  const revoiceSink: { last?: CapturedSendChat } = {};
  const followSink: { last?: CapturedSendChat } = {};
  const commentSink: { last?: CapturedSendChat } = {};
  const synthSink: { last?: CapturedSendChat } = {};

  const revoiced = await createFacilitatorService(
    textSendChat(llmRevoice, revoiceSink)
  ).revoice(CRITIQUE, CTX);
  assert(
    revoiced.includes(llmRevoice),
    "revoice returns sendChat text (or a wrapped version) (6.4, 11.3)"
  );
  assertEqual(
    revoiceSink.last?.provider,
    "openai",
    "revoice uses the offering provider"
  );
  assertEqual(
    revoiceSink.last?.model,
    "gpt-4o-mini",
    "revoice uses the offering model"
  );
  assert(
    promptBlob(revoiceSink.last).includes(CRITIQUE),
    "revoice prompt includes the critique text"
  );

  const followed = await createFacilitatorService(
    textSendChat(llmFollowUp, followSink)
  ).askFollowUp(EXCHANGE, CTX);
  assert(
    followed.includes(llmFollowUp),
    "askFollowUp returns sendChat text (or a wrapped version) (9.3, 9.4)"
  );
  assert(
    promptBlob(followSink.last).includes(EXCHANGE.evidence),
    "follow-up prompt includes the stated evidence (9.4)"
  );

  const commented = await createFacilitatorService(
    textSendChat(llmComment, commentSink)
  ).commentOnDocument(SNAPSHOT, CTX);
  assert(
    typeof commented === "string" && commented.includes(llmComment),
    "commentOnDocument returns sendChat text (or a wrapped version) (11.4)"
  );
  assert(
    promptBlob(commentSink.last).includes(SNAPSHOT.snapshotText),
    "commentOnDocument includes the latest snapshot quote in the sendChat prompt (7.1, 11.4)"
  );
  assert(
    /vague|unmeasurable|rationale/i.test(promptBlob(commentSink.last)),
    "commentOnDocument prompt asks to flag vague criteria or missing rationale (11.4)"
  );

  const synthesized = await createFacilitatorService(
    textSendChat(llmSynthesis, synthSink)
  ).synthesizeFinal(STATE, RUBRIC_SNAPSHOT, CHAT_EXCERPT, CTX);
  assert(
    synthesized.includes(llmSynthesis),
    "synthesizeFinal returns sendChat text (or a wrapped version) for auto lock (10.3)"
  );
  const synthPrompt = promptBlob(synthSink.last);
  assert(
    synthPrompt.includes(RUBRIC_SNAPSHOT),
    "synthesizeFinal prompt includes the rubric snapshot (10.3)"
  );
  assert(
    synthPrompt.includes(CHAT_EXCERPT),
    "synthesizeFinal prompt includes the discussion excerpt (10.3)"
  );
  assert(
    /unresolved|best-available|lock/i.test(synthPrompt),
    "synthesizeFinal prompt is an auto-lock best-available synthesis (10.3)"
  );

  if (failures > 0) {
    console.error(`\nfacilitator.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("facilitator.selftest: all assertions passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
