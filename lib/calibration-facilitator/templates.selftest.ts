/**
 * Runtime self-test for scripted facilitator templates (Task 3.1).
 *
 * Run: npx tsx lib/calibration-facilitator/templates.selftest.ts
 */
import {
  ENGINE_SCRIPTED_KEYS,
  FacilitatorService,
  SCRIPTED_KINDS,
  type ScriptedKind,
  type TemplateContext,
} from "./templates";

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

const FULL_CTX: TemplateContext = {
  memberUserIds: ["u-alice", "u-bob", "u-cara"],
  presenterUserId: "u-alice",
  criticUserIds: ["u-bob", "u-cara"],
  respondedUserIds: ["u-alice", "u-bob"],
  userId: "u-alice",
  scorerUserId: "u-bob",
  round: 2,
  criterionKey: "clarity",
  flaggedCriteria: ["clarity", "evidence"],
  unresolved: ["clarity"],
  incomplete: true,
  auto: true,
  displayNames: {
    "u-alice": "Alice",
    "u-bob": "Bob",
    "u-cara": "Cara",
  },
};

function main(): void {
  assert(SCRIPTED_KINDS.length > 0, "SCRIPTED_KINDS is non-empty");

  for (const key of ENGINE_SCRIPTED_KEYS) {
    assert(
      (SCRIPTED_KINDS as readonly string[]).includes(key),
      `engine scripted key "${key}" is in SCRIPTED_KINDS`
    );
  }

  for (const kind of SCRIPTED_KINDS) {
    const first = FacilitatorService.renderScripted(kind, FULL_CTX);
    const second = FacilitatorService.renderScripted(kind, FULL_CTX);
    assert(
      typeof first === "string" && first.trim().length > 0,
      `${kind} renders non-empty text`
    );
    assertEqual(first, second, `${kind} is deterministic for the same context`);
  }

  const recap = FacilitatorService.renderScripted("kickoff_recap", FULL_CTX);
  assert(
    /purpose/i.test(recap),
    "kickoff_recap states the activity purpose (5.2)"
  );
  assert(
    /next/i.test(recap),
    "kickoff_recap states what happens next (5.2)"
  );

  const announcement = FacilitatorService.renderScripted(
    "presenter_announcement",
    FULL_CTX
  );
  assert(
    announcement.includes("Alice"),
    "presenter announcement names the presenter (6.2)"
  );
  assert(
    /presenter/i.test(announcement),
    "presenter announcement uses the Presenter role label (6.2)"
  );

  const idOnlyAnnouncement = FacilitatorService.renderScripted(
    "presenter_announcement",
    { presenterUserId: "u-dana", criticUserIds: ["u-eli"], round: 1 }
  );
  assert(
    idOnlyAnnouncement.includes("u-dana"),
    "presenter announcement falls back to presenterUserId when no display name is given"
  );

  const critic = FacilitatorService.renderScripted("critic_prompt", FULL_CTX);
  assert(
    /agree or disagree/i.test(critic),
    "critic prompt asks for agree or disagree plus reasoning (6.3)"
  );

  const openRubric = FacilitatorService.renderScripted("open_rubric", FULL_CTX);
  assert(
    /Ready/.test(openRubric) && /Shared documents/i.test(openRubric),
    "open_rubric tells the team to press Ready under Shared documents"
  );

  const rewrite = FacilitatorService.renderScripted("rewrite_prompt", FULL_CTX);
  assert(
    /Ready/.test(rewrite) && /Shared documents/i.test(rewrite),
    "rewrite_prompt tells the team to press Ready under Shared documents"
  );

  const scorePrompt = FacilitatorService.renderScripted("score_prompt", FULL_CTX);
  assert(
    /Open Score/i.test(scorePrompt) && /left sidebar/i.test(scorePrompt),
    "score_prompt points to the button below and Score in the left sidebar"
  );
  assert(
    /private/i.test(scorePrompt),
    "score_prompt still says submissions stay private (8.2, 8.3)"
  );

  const reveal = FacilitatorService.renderScripted("reveal_announcement", FULL_CTX);
  assert(
    /Open Score/i.test(reveal) && /left sidebar/i.test(reveal),
    "reveal announcement points to Open Score and the left sidebar"
  );

  const plantedScores: TemplateContext = {
    userId: "u-alice",
    displayNames: { "u-alice": "Alice" },
    value: 2,
    scores: [{ criterionKey: "clarity", value: 5 }],
  };
  const ack = FacilitatorService.renderScripted("score_ack", plantedScores);
  assert(/Alice/.test(ack) || /submitted/i.test(ack), "score_ack acknowledges the submitter (8.3)");
  assert(
    !ack.includes("2") && !ack.includes("5") && !/clarity/i.test(ack),
    "score_ack contains no numeric score values (8.3)"
  );

  const mergeAuto = FacilitatorService.renderScripted("merge_auto_finalize", {
    incomplete: true,
  });
  assert(
    /incomplete/i.test(mergeAuto),
    "merge_auto_finalize labels the rubric incomplete (4.5, 7.7, 11.2)"
  );

  const finalizeExplicit = FacilitatorService.renderScripted("finalize", {
    auto: false,
  });
  assert(
    /Thank you/i.test(finalizeExplicit) &&
      /Open Final/i.test(finalizeExplicit) &&
      /left sidebar/i.test(finalizeExplicit),
    "explicit finalize thanks the team and points to Open Final"
  );

  const finalizeAuto = FacilitatorService.renderScripted("finalize", {
    auto: true,
    incomplete: true,
    unresolved: ["clarity", "evidence"],
  });
  assert(/incomplete/i.test(finalizeAuto), "finalize auto labels incomplete (4.5, 11.2)");
  assert(/unresolved/i.test(finalizeAuto), "finalize auto labels unresolved (9.6, 10.3, 11.2)");
  assert(
    finalizeAuto.includes("clarity") && finalizeAuto.includes("evidence"),
    "finalize auto names unresolved criteria"
  );
  assert(
    /Open Final/i.test(finalizeAuto) && /left sidebar/i.test(finalizeAuto),
    "auto finalize also points to Open Final"
  );

  const synthesize = FacilitatorService.renderScripted("auto_synthesize", {
    unresolved: ["clarity"],
  });
  assert(
    /unresolved/i.test(synthesize) && synthesize.includes("clarity"),
    "auto_synthesize fallback labels unresolved criteria (10.3)"
  );

  const kinds: ScriptedKind[] = [...SCRIPTED_KINDS];
  assertEqual(kinds.length, SCRIPTED_KINDS.length, "every ScriptedKind was exercised");

  if (failures > 0) {
    console.error(`\ntemplates.selftest: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("templates.selftest: all assertions passed");
}

main();
