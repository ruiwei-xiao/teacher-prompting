/**
 * Effect executor + team-space handlers (Task 4.2).
 * Persist engine state first; facilitator posts and notices are presentation
 * and never roll back a committed transition (11.5).
 *
 * Session is resolved by route wrappers; these accept userId for testability.
 */
import { resolveCaller } from "./access";
import type { ApiResult } from "./offerings";
import {
  applyLearnerEvent,
  applySpread,
  evaluateTeam,
  getCritiqueRoles,
  startTeam,
} from "@/lib/calibration-engine/engine";
import {
  createFacilitatorService,
  type FacilitatorService,
  type TeamContext,
} from "@/lib/calibration-facilitator/facilitator";
import {
  isScriptedKind,
  type ScriptedKind,
} from "@/lib/calibration-facilitator/templates";
import {
  createNoticeService,
  type NoticeService,
} from "@/lib/calibration-notices/notices";
import {
  appendMessage,
  formTeam,
  getOffering,
  getScoresForMember,
  getTeam,
  getTeamForMember,
  listQueuedCheckIns,
  markDeliverableLocked,
  recordAbsence,
  revealScores,
  saveDocSnapshot,
  saveTeamState,
  updateLastSeen,
} from "@/lib/calibration-store/store";
import type {
  CheckIn,
  CriterionScore,
  CritiqueStage,
  DocKind,
  EngineEffect,
  FacilitatorMessageSpec,
  Message,
  MessageKind,
  NoticeSpec,
  Offering,
  Team,
  TeamPhase,
  TeamStateRecord,
  TeamView,
} from "@/lib/calibration-store/types";
import { DOC_KINDS } from "@/lib/calibration-store/types";

export type ExecuteEffectsDeps = {
  facilitator?: FacilitatorService;
  notices?: NoticeService;
};

export type SpaceDeps = ExecuteEffectsDeps & {
  now?: Date;
};

export type DocMeta = {
  docKind: DocKind;
  updatedAt: string;
  updatedBy: string;
};

export type SpaceRecap = {
  since: string | null;
  messages: Message[];
};

export type SpaceState = {
  role: "member" | "operator";
  phase: TeamPhase;
  round: number;
  critiqueStage: CritiqueStage;
  presenterUserId: string | null;
  criticUserIds: string[];
  recap: SpaceRecap;
  messages: Message[];
  docs: DocMeta[];
  ownScores: CriterionScore[];
  submittedBy: string[];
  revealedAt: string | null;
  locked: boolean;
};

export type PostedMessage = {
  message: Message;
  space: SpaceState;
};

export type PostedSnapshot = {
  savedAt: string;
};

const defaultFacilitator = createFacilitatorService();
const defaultNotices = createNoticeService();

function unauthorized<T = never>(): ApiResult<T> {
  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}

function forbidden(): ApiResult<never> {
  return { ok: false, status: 403, body: { error: "Forbidden" } };
}

function notFound(message: string): ApiResult<never> {
  return { ok: false, status: 404, body: { error: message } };
}

function badRequest(message: string): ApiResult<never> {
  return { ok: false, status: 400, body: { error: message } };
}

function conflict(message: string): ApiResult<never> {
  return { ok: false, status: 409, body: { error: message } };
}

function isDocKind(value: string): value is DocKind {
  return (DOC_KINDS as readonly string[]).includes(value);
}

function clock(deps?: SpaceDeps): Date {
  return deps?.now ?? new Date();
}

function logPresentationFailure(kind: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`calibration-api: ${kind} presentation failed (${reason})`);
}

function messageKindFor(key: string): MessageKind {
  if (key === "revoice") return "revoice";
  if (key === "doc_comment") return "doc_comment";
  if (
    key === "kickoff_recap" ||
    key === "presenter_announcement" ||
    key === "rotation_notice" ||
    key === "reveal_announcement" ||
    key === "merge_auto_finalize" ||
    key === "auto_synthesize" ||
    key === "finalize"
  ) {
    return "announcement";
  }
  return "prompt";
}

function asScriptedKind(key: string): ScriptedKind | null {
  return isScriptedKind(key) ? key : null;
}

function teamContext(
  offering: Offering,
  spec: FacilitatorMessageSpec
): TeamContext {
  return {
    ...spec.context,
    aiProvider: offering.aiProvider,
    aiModel: offering.aiModel,
    apiKey: "",
  };
}

function latestLearnerBody(view: TeamView | null): string {
  if (!view) return "";
  for (let index = view.messages.length - 1; index >= 0; index -= 1) {
    const message = view.messages[index];
    if (message?.authorKind === "learner") {
      return message.body;
    }
  }
  return "";
}

function chatExcerpt(view: TeamView | null, limit = 8): string {
  if (!view) return "";
  return view.messages
    .slice(-limit)
    .map((message) => `${message.authorKind}: ${message.body}`)
    .join("\n");
}

function rubricSnapshot(view: TeamView | null): string {
  return (
    view?.docs.find((doc) => doc.docKind === "rubric")?.snapshotText ?? ""
  );
}

async function loadTeamView(team: Team): Promise<TeamView | null> {
  const memberId = team.members[0]?.userId;
  if (!memberId) return null;
  return getTeamForMember(team.id, memberId);
}

async function renderFacilitatorBody(
  spec: FacilitatorMessageSpec,
  offering: Offering,
  view: TeamView | null,
  facilitator: FacilitatorService,
  state: TeamStateRecord
): Promise<{ body: string; kind: MessageKind }> {
  const kind = messageKindFor(spec.key);
  const scripted = asScriptedKind(spec.key);
  if (spec.source === "scripted") {
    if (!scripted) {
      throw new Error(`Unknown scripted facilitator kind: ${spec.key}`);
    }
    return { body: facilitator.renderScripted(scripted, spec.context), kind };
  }

  const ctx = teamContext(offering, spec);
  if (spec.key === "revoice") {
    return {
      body: await facilitator.revoice(latestLearnerBody(view), ctx),
      kind: "revoice",
    };
  }
  if (spec.key === "follow_up") {
    const userId =
      typeof spec.context.userId === "string" ? spec.context.userId : "";
    return {
      body: await facilitator.askFollowUp(
        {
          userId,
          evidence: latestLearnerBody(view),
          criterionKey:
            typeof spec.context.criterionKey === "string"
              ? spec.context.criterionKey
              : undefined,
        },
        ctx
      ),
      kind: "prompt",
    };
  }
  if (spec.key === "auto_synthesize") {
    return {
      body: await facilitator.synthesizeFinal(
        state,
        rubricSnapshot(view),
        chatExcerpt(view),
        ctx
      ),
      kind: "announcement",
    };
  }
  if (spec.key === "doc_comment") {
    const snapshot = view?.docs.find((doc) => doc.docKind === "rubric") ??
      view?.docs[0];
    if (!snapshot) {
      if (scripted) {
        return { body: facilitator.renderScripted(scripted, spec.context), kind };
      }
      return { body: "", kind: "doc_comment" };
    }
    const comment = await facilitator.commentOnDocument(snapshot, ctx);
    return { body: comment ?? "", kind: "doc_comment" };
  }
  if (scripted) {
    return { body: facilitator.renderScripted(scripted, spec.context), kind };
  }
  throw new Error(`Unknown facilitator message key: ${spec.key}`);
}

function enrichNotice(
  notice: NoticeSpec,
  teamId: string,
  offering: Offering
): NoticeSpec {
  const offeringId = notice.offeringId ?? offering.id;
  const deepLink =
    notice.deepLink === "/activity"
      ? `/activity/${offeringId}/team/${teamId}`
      : notice.deepLink;
  return {
    ...notice,
    offeringId,
    teamId: notice.teamId ?? teamId,
    deepLink,
  };
}

/**
 * Shared by space endpoints, check-in/formation (4.3), and the cron tick (4.6).
 * Commits engine state before any presentation work.
 */
export async function executeEffects(
  teamId: string,
  state: TeamStateRecord,
  effects: EngineEffect[],
  now: Date,
  deps: ExecuteEffectsDeps = {}
): Promise<TeamStateRecord> {
  const facilitator = deps.facilitator ?? defaultFacilitator;
  const notices = deps.notices ?? defaultNotices;

  await saveTeamState(teamId, state);
  let current = state;
  const allEffects: EngineEffect[] = [...effects];

  for (let index = 0; index < allEffects.length; index += 1) {
    const effect = allEffects[index]!;
    if (effect.kind === "markAbsent") {
      await recordAbsence(teamId, effect.userId, effect.stepKey);
      continue;
    }
    if (effect.kind === "revealScores") {
      const revealed = await revealScores(teamId, now);
      const spread = applySpread(current, revealed);
      current = spread.state;
      await saveTeamState(teamId, current);
      allEffects.push(...spread.effects);
      continue;
    }
    if (effect.kind === "lockDeliverable") {
      await markDeliverableLocked(teamId, effect.auto);
    }
  }

  const team = await getTeam(teamId);
  if (!team) {
    return current;
  }
  const offering = await getOffering(team.offeringId);
  if (!offering) {
    return current;
  }
  const view = await loadTeamView(team);

  for (const effect of allEffects) {
    if (effect.kind === "postFacilitator") {
      try {
        const rendered = await renderFacilitatorBody(
          effect.message,
          offering,
          view,
          facilitator,
          current
        );
        if (rendered.body.trim().length === 0) {
          continue;
        }
        await appendMessage(teamId, {
          authorKind: "facilitator",
          authorUserId: null,
          kind: rendered.kind,
          body: rendered.body,
          phase: current.phase,
        });
      } catch (error) {
        logPresentationFailure("facilitator", error);
      }
      continue;
    }
    if (effect.kind === "sendNotice") {
      try {
        await notices.send(enrichNotice(effect.notice, teamId, offering));
      } catch (error) {
        logPresentationFailure("notice", error);
      }
    }
  }

  return current;
}

/**
 * Recover offeringId for a `formTeam` queue effect (no offeringId on the
 * effect). 4.3/4.6 call this with the check-in set used for evaluateQueue.
 */
export function offeringIdFromCheckIns(
  checkIns: CheckIn[],
  memberUserIds: readonly string[]
): string | null {
  const matches = checkIns.filter((checkIn) =>
    memberUserIds.includes(checkIn.userId)
  );
  const offeringIds = new Set(matches.map((checkIn) => checkIn.offeringId));
  if (offeringIds.size !== 1) {
    return null;
  }
  return [...offeringIds][0] ?? null;
}

/**
 * Persist a newly formed team and run startTeam effects through the executor.
 * Used by check-in / manual match (4.3, 4.5).
 */
export async function executeFormation(
  memberUserIds: [string, string, string],
  now: Date,
  deps: ExecuteEffectsDeps = {},
  offeringId?: string
): Promise<{ teamId: string; state: TeamStateRecord }> {
  let resolvedOfferingId = offeringId ?? null;
  if (!resolvedOfferingId) {
    resolvedOfferingId = offeringIdFromCheckIns(
      await listQueuedCheckIns(),
      memberUserIds
    );
  }
  if (!resolvedOfferingId) {
    throw new Error(
      "formTeam effect has no offeringId; queued check-ins did not identify one offering"
    );
  }
  const team = await formTeam(resolvedOfferingId, memberUserIds);
  const started = startTeam(memberUserIds, now);
  const state = await executeEffects(
    team.id,
    started.state,
    started.effects,
    now,
    deps
  );
  return { teamId: team.id, state };
}

function recapSince(messages: Message[], lastSeenAt: string | null): SpaceRecap {
  if (lastSeenAt === null) {
    return { since: null, messages };
  }
  return {
    since: lastSeenAt,
    messages: messages.filter((message) => message.createdAt > lastSeenAt),
  };
}

async function serializeSpace(
  teamId: string,
  role: "member" | "operator",
  userId: string
): Promise<SpaceState | null> {
  const team = await getTeam(teamId);
  if (!team) return null;
  const view = await loadTeamView(team);
  const messages = view?.messages ?? [];
  const docs: DocMeta[] = (view?.docs ?? []).map((doc) => ({
    docKind: doc.docKind,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  }));
  const member = team.members.find((entry) => entry.userId === userId) ?? null;
  const lastSeenAt = role === "member" ? (member?.lastSeenAt ?? null) : null;
  const roles =
    team.state.phase === "critique" ? getCritiqueRoles(team.state) : null;
  const scores =
    role === "member" ? await getScoresForMember(teamId, userId) : null;
  return {
    role,
    phase: team.state.phase,
    round: team.state.round,
    critiqueStage: team.state.critiqueStage,
    presenterUserId: roles?.presenterUserId ?? null,
    criticUserIds: roles?.criticUserIds ?? [],
    recap: recapSince(messages, lastSeenAt),
    messages,
    docs,
    ownScores: scores?.ownScores ?? [],
    submittedBy: scores?.submittedBy ?? [],
    revealedAt: team.scoresRevealedAt,
    locked: team.finalizedAt !== null || team.state.phase === "finalized",
  };
}

/** Member GET only: opportunistic evaluate + execute, then serialize. */
async function evaluateAndSerialize(
  team: Team,
  role: "member" | "operator",
  userId: string,
  deps?: SpaceDeps
): Promise<SpaceState | null> {
  const now = clock(deps);
  const evaluated = evaluateTeam(team.state, now);
  await executeEffects(team.id, evaluated.state, evaluated.effects, now, deps);
  const space = await serializeSpace(team.id, role, userId);
  if (role === "member") {
    await updateLastSeen(team.id, userId, now);
  }
  return space;
}

export async function getSpace(
  userId: string | null,
  teamId: string,
  deps?: SpaceDeps
): Promise<ApiResult<SpaceState>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role === "denied") {
    return forbidden();
  }
  if (caller.role === "operator" && !caller.team) {
    return notFound("Team not found");
  }
  const team = caller.team;
  if (!team) {
    return notFound("Team not found");
  }
  // Requirement 14.6: operator viewing must not reset clocks or advance phases.
  const space =
    caller.role === "operator"
      ? await serializeSpace(team.id, "operator", userId)
      : await evaluateAndSerialize(team, "member", userId, deps);
  if (!space) {
    return notFound("Team not found");
  }
  return { ok: true, status: 200, body: space };
}

function readMessageBody(body: unknown): string | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid message" };
  }
  const value = (body as Record<string, unknown>).body;
  if (typeof value !== "string") {
    return { error: "Missing body" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: "Missing body" };
  }
  return trimmed;
}

function readSnapshotText(body: unknown): string | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid snapshot" };
  }
  const value = (body as Record<string, unknown>).text;
  if (typeof value !== "string") {
    return { error: "Missing text" };
  }
  return value;
}

export async function postMessage(
  userId: string | null,
  teamId: string,
  body: unknown,
  deps?: SpaceDeps
): Promise<ApiResult<PostedMessage>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role !== "member") {
    return forbidden();
  }
  const parsed = readMessageBody(body);
  if (typeof parsed !== "string") {
    return badRequest(parsed.error);
  }
  const now = clock(deps);
  const message = await appendMessage(teamId, {
    authorKind: "learner",
    authorUserId: userId,
    kind: "chat",
    body: parsed,
    phase: caller.team.state.phase,
  });
  const applied = applyLearnerEvent(
    caller.team.state,
    { kind: "message", userId, body: parsed },
    now
  );
  await executeEffects(teamId, applied.state, applied.effects, now, deps);
  const space = await serializeSpace(teamId, "member", userId);
  if (!space) {
    return notFound("Team not found");
  }
  return { ok: true, status: 200, body: { message, space } };
}

export async function postDocSnapshot(
  userId: string | null,
  teamId: string,
  docKind: string,
  body: unknown,
  deps?: SpaceDeps
): Promise<ApiResult<PostedSnapshot>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role !== "member") {
    return forbidden();
  }
  if (!isDocKind(docKind)) {
    return badRequest("Invalid document kind");
  }
  const parsed = readSnapshotText(body);
  if (typeof parsed !== "string") {
    return badRequest(parsed.error);
  }
  const now = clock(deps);
  try {
    await saveDocSnapshot(teamId, docKind, parsed, userId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("locked")) {
      return conflict("final rubric is locked");
    }
    throw error;
  }
  const applied = applyLearnerEvent(
    caller.team.state,
    { kind: "docSnapshot", userId, docKind },
    now
  );
  await executeEffects(teamId, applied.state, applied.effects, now, deps);
  const view = await getTeamForMember(teamId, userId);
  const savedAt =
    view?.docs.find((doc) => doc.docKind === docKind)?.updatedAt ??
    now.toISOString();
  return { ok: true, status: 200, body: { savedAt } };
}
