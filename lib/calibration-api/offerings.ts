/**
 * Calibration offering + course-gate handlers, plus a minimal team GET that
 * only enforces the ACL (Task 4.1). Session is resolved by route wrappers;
 * these accept userId for testability.
 *
 * Joining a team / creating an offering never touches Workspace membership.
 */
import { publicOffering } from "./facilitator-key";
import { resolveCaller } from "./access";
import { queueStatusFor } from "./queue";
import {
  createOffering as persistOffering,
  getOffering,
  listOfferingsForOperator,
} from "@/lib/calibration-store/store";
import type { Offering, OfferingInput } from "@/lib/calibration-store/types";

export type ApiError = { error: string };

export type ApiResult<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: number; body: ApiError };

export type OfferingArtifactsMeta = {
  sampleAppId: string;
  hasSampleRubric: boolean;
  hasDeploymentBrief: boolean;
  hasTranscriptExcerpt: boolean;
};

export type OfferingListItem = {
  id: string;
  title: string;
  createdAt: string;
};

export type GateView = {
  offering: {
    id: string;
    title: string;
    artifacts: OfferingArtifactsMeta;
  };
  me: {
    checkedIn: boolean;
    queueCount: number;
    teamId: string | null;
    role: "operator" | "learner";
  };
};

export type TeamAccessView = {
  role: "member" | "operator";
};

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

function readRequiredString(value: unknown, field: string): string | ApiError {
  if (typeof value !== "string") {
    return { error: `Missing ${field}` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: `Missing ${field}` };
  }
  return trimmed;
}

function parseOfferingInput(body: unknown): OfferingInput | ApiError {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid offering" };
  }
  const input = body as Record<string, unknown>;
  const title = readRequiredString(input.title, "title");
  if (typeof title !== "string") return title;
  const sampleAppId = readRequiredString(input.sampleAppId, "sampleAppId");
  if (typeof sampleAppId !== "string") return sampleAppId;
  const sampleRubric = readRequiredString(input.sampleRubric, "sampleRubric");
  if (typeof sampleRubric !== "string") return sampleRubric;
  const deploymentBrief = readRequiredString(
    input.deploymentBrief,
    "deploymentBrief"
  );
  if (typeof deploymentBrief !== "string") return deploymentBrief;
  const transcriptExcerpt = readRequiredString(
    input.transcriptExcerpt,
    "transcriptExcerpt"
  );
  if (typeof transcriptExcerpt !== "string") return transcriptExcerpt;
  const aiProvider = readRequiredString(input.aiProvider, "aiProvider");
  if (typeof aiProvider !== "string") return aiProvider;
  const aiModel = readRequiredString(input.aiModel, "aiModel");
  if (typeof aiModel !== "string") return aiModel;
  const rawKey = input.facilitatorApiKey;
  if (rawKey !== undefined && rawKey !== null && typeof rawKey !== "string") {
    return { error: "Invalid facilitatorApiKey" };
  }
  const facilitatorApiKey =
    typeof rawKey === "string" && rawKey.trim() ? rawKey.trim() : undefined;
  return {
    title,
    sampleAppId,
    sampleRubric,
    deploymentBrief,
    transcriptExcerpt,
    aiProvider,
    aiModel,
    ...(facilitatorApiKey ? { facilitatorApiKey } : {}),
  };
}

function artifactsMeta(offering: Offering): OfferingArtifactsMeta {
  return {
    sampleAppId: offering.sampleAppId,
    hasSampleRubric: offering.sampleRubric.trim().length > 0,
    hasDeploymentBrief: offering.deploymentBrief.trim().length > 0,
    hasTranscriptExcerpt: offering.transcriptExcerpt.trim().length > 0,
  };
}

export async function createOffering(
  userId: string | null,
  body: unknown
): Promise<ApiResult<{ offering: Offering }>> {
  if (!userId) return unauthorized();
  const parsed = parseOfferingInput(body);
  if ("error" in parsed) {
    return badRequest(parsed.error);
  }
  const offering = await persistOffering(parsed, userId);
  return { ok: true, status: 200, body: { offering: publicOffering(offering) } };
}

/** Operator's own offerings only (design: GET list mine). */
export async function listMyOfferings(
  userId: string | null
): Promise<ApiResult<{ offerings: OfferingListItem[] }>> {
  if (!userId) return unauthorized();
  const offerings = await listOfferingsForOperator(userId);
  return {
    ok: true,
    status: 200,
    body: {
      offerings: offerings.map((offering) => ({
        id: offering.id,
        title: offering.title,
        createdAt: offering.createdAt,
      })),
    },
  };
}

/**
 * Course-gate status. Any signed-in user may view the offering.
 * Does not check the caller into the matching queue (Requirement 15.4).
 */
export async function getOfferingGate(
  userId: string | null,
  offeringId: string
): Promise<ApiResult<GateView>> {
  if (!userId) return unauthorized();
  const offering = await getOffering(offeringId);
  if (!offering) {
    return notFound("Offering not found");
  }
  const me = await queueStatusFor(offeringId, userId);
  return {
    ok: true,
    status: 200,
    body: {
      offering: {
        id: offering.id,
        title: offering.title,
        artifacts: artifactsMeta(offering),
      },
      me: {
        checkedIn: me.checkedIn,
        queueCount: me.queueCount,
        teamId: me.teamId,
        role: offering.operatorUserId === userId ? "operator" : "learner",
      },
    },
  };
}

/**
 * Minimal team GET: ACL only. Members get read/write role, operators get
 * read-only operator role, everyone else is denied (Requirement 15.1).
 * Does not run the engine or return space contents (Task 4.2).
 */
export async function getTeamAccess(
  userId: string | null,
  teamId: string
): Promise<ApiResult<TeamAccessView>> {
  if (!userId) return unauthorized();
  const caller = await resolveCaller(userId, { teamId });
  if (caller.role === "not_found") {
    return notFound("Team not found");
  }
  if (caller.role === "denied") {
    return forbidden();
  }
  return { ok: true, status: 200, body: { role: caller.role } };
}
