/**
 * Scripted facilitator message catalog (Task 3.1).
 * Deterministic templates only — no LLM, no I/O.
 *
 * Keys include every engine `postFacilitator` scripted `message.key`
 * plus catalog kinds required by 5.2 / 6.2 / 6.3 / 8.3 / 11.1 / 11.2
 * (rotation, reveal, nudge, finalize labels, and LLM fallbacks).
 */

export const SCRIPTED_KINDS = [
  "kickoff_recap",
  "presenter_announcement",
  "presenter_prompt",
  "critic_prompt",
  "rotation_notice",
  "revoice",
  "open_rubric",
  "score_ack",
  "reveal_announcement",
  "score_prompt",
  "targeted_prompt",
  "rewrite_prompt",
  "nudge",
  "merge_auto_finalize",
  "follow_up",
  "auto_synthesize",
  "finalize",
] as const;

export type ScriptedKind = (typeof SCRIPTED_KINDS)[number];

/** Engine-emitted `source: "scripted"` keys — must stay renderable. */
export const ENGINE_SCRIPTED_KEYS = [
  "kickoff_recap",
  "presenter_announcement",
  "presenter_prompt",
  "critic_prompt",
  "open_rubric",
  "score_prompt",
  "score_ack",
  "merge_auto_finalize",
  "rewrite_prompt",
  "targeted_prompt",
] as const satisfies readonly ScriptedKind[];

export type TemplateContext = Record<string, unknown>;

export function isScriptedKind(value: string): value is ScriptedKind {
  return (SCRIPTED_KINDS as readonly string[]).includes(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function displayNamesOf(ctx: TemplateContext): Record<string, string> {
  const raw = ctx.displayNames;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const names: Record<string, string> = {};
  for (const [id, label] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof label === "string" && label.length > 0) {
      names[id] = label;
    }
  }
  return names;
}

function nameOf(id: unknown, ctx: TemplateContext): string {
  const userId = asString(id);
  if (userId === undefined) {
    return "a teammate";
  }
  return displayNamesOf(ctx)[userId] ?? userId;
}

function listNames(ids: unknown, ctx: TemplateContext): string {
  const list = asStringList(ids);
  if (list.length === 0) {
    return "the team";
  }
  if (list.length === 1) {
    return nameOf(list[0], ctx);
  }
  if (list.length === 2) {
    return `${nameOf(list[0], ctx)} and ${nameOf(list[1], ctx)}`;
  }
  const last = list[list.length - 1]!;
  return `${list
    .slice(0, -1)
    .map((id) => nameOf(id, ctx))
    .join(", ")}, and ${nameOf(last, ctx)}`;
}

function listItems(items: readonly string[]): string {
  if (items.length === 0) {
    return "none listed";
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function roundLabel(ctx: TemplateContext): string {
  return typeof ctx.round === "number" ? String(ctx.round) : "this";
}

function criterionLabel(ctx: TemplateContext): string {
  return asString(ctx.criterionKey) ?? "this criterion";
}

const TEMPLATES: Record<ScriptedKind, (ctx: TemplateContext) => string> = {
  kickoff_recap: (ctx) =>
    `Welcome ${listNames(ctx.memberUserIds, ctx)}. The purpose of this activity is to calibrate a shared rubric for the sample bot: each of you will present an individual critique, merge those critiques into a few criteria, score the artifact privately, discuss large gaps, and lock a final rubric. Next: the first Presenter shares their critique of the sample rubric.`,

  presenter_announcement: (ctx) =>
    `${nameOf(ctx.presenterUserId, ctx)} is the Presenter for round ${roundLabel(ctx)}. Critics: ${listNames(ctx.criticUserIds, ctx)}.`,

  presenter_prompt: (ctx) =>
    `${nameOf(ctx.presenterUserId, ctx)}, please share your individual critique of the sample rubric for round ${roundLabel(ctx)}.`,

  critic_prompt: (ctx) =>
    `${listNames(ctx.criticUserIds, ctx)}, the Presenter (${nameOf(ctx.presenterUserId, ctx)}) has shared. Please respond with agree or disagree plus your reasoning.`,

  rotation_notice: (ctx) =>
    `Round roles are rotating. ${nameOf(ctx.presenterUserId, ctx)} is now the Presenter for round ${roundLabel(ctx)}.`,

  revoice: (ctx) =>
    `Facilitator recap: a critique from ${nameOf(ctx.presenterUserId ?? ctx.userId, ctx)} has been recorded for the team.`,

  open_rubric: () =>
    `The shared rubric is now open. Please synthesize 3 to 4 criteria, each with a one-line rationale.`,

  score_ack: (ctx) =>
    `${nameOf(ctx.userId, ctx)} submitted their scores. The values stay private until every present member has submitted.`,

  reveal_announcement: () =>
    `Scores are now revealed to the team. Review the matrix together; we will discuss any large gaps.`,

  score_prompt: () =>
    `Please score the attached artifact against the team's rubric. Submissions stay private until every present member has submitted.`,

  targeted_prompt: (ctx) =>
    `${nameOf(ctx.scorerUserId, ctx)}, what in the artifact led to your score on ${criterionLabel(ctx)}?`,

  rewrite_prompt: (ctx) => {
    const flagged = asStringList(ctx.flaggedCriteria);
    const flaggedClause =
      flagged.length > 0
        ? ` Focus on ${listItems(flagged)}.`
        : "";
    return `Please rewrite criteria that produced disagreement and confirm the final rubric together.${flaggedClause}`;
  },

  nudge: (ctx) =>
    `${nameOf(ctx.userId, ctx)}, please contribute to the shared rubric. The merge continues with remaining input.`,

  merge_auto_finalize: (ctx) =>
    ctx.incomplete === true
      ? `The merge window closed. The shared rubric is auto-finalized and labeled incomplete. Scoring begins next.`
      : `The merge window closed. The shared rubric is auto-finalized. Scoring begins next.`,

  follow_up: (ctx) =>
    `${nameOf(ctx.userId, ctx)}, does that evidence change your reading?`,

  auto_synthesize: (ctx) => {
    const unresolved = asStringList(ctx.unresolved);
    const label =
      unresolved.length > 0
        ? ` Unresolved criteria are labeled unresolved: ${listItems(unresolved)}.`
        : ` Unresolved parts are labeled unresolved.`;
    return `A best-available final rubric has been locked from the work collected so far.${label}`;
  },

  finalize: (ctx) => {
    if (ctx.auto !== true) {
      return `The team has locked the final rubric as the group deliverable.`;
    }
    const parts = ["This activity is auto-finalized."];
    if (ctx.incomplete === true) {
      parts.push("Incomplete work is labeled incomplete.");
    }
    const unresolved = asStringList(ctx.unresolved);
    if (unresolved.length > 0) {
      parts.push(
        `Unresolved criteria are labeled unresolved: ${listItems(unresolved)}.`
      );
    }
    return parts.join(" ");
  },
};

export function renderScripted(kind: ScriptedKind, ctx: TemplateContext): string {
  const render = TEMPLATES[kind];
  if (render === undefined) {
    throw new Error(`Unknown scripted facilitator kind: ${String(kind)}`);
  }
  return render(ctx);
}

export const FacilitatorService = {
  renderScripted,
};
