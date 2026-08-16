/**
 * Client-safe offering-create helpers (Task 5.1).
 * Maps the operator form onto POST /api/calibration/offerings.
 * Own-bot options come from the existing GET /api/apps (AppGrid).
 */
import { parseModelSelection } from "@/lib/app-store/model-selection";

export const OFFERING_CREATE_API = "/api/calibration/offerings";
export const OFFERING_LIST_API = "/api/calibration/offerings";
export const OWN_BOTS_API = "/api/apps";
export const ACTIVITY_HREF = "/activity";
export const ACTIVITY_NEW_HREF = "/activity/new";

export function isCalibrationPath(pathname: string): boolean {
  return pathname === ACTIVITY_HREF || pathname.startsWith(`${ACTIVITY_HREF}/`);
}

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type OfferingCreatePayload = {
  title: string;
  sampleAppId: string;
  sampleRubric: string;
  deploymentBrief: string;
  transcriptExcerpt: string;
  aiProvider: string;
  aiModel: string;
  facilitatorApiKey?: string;
};

export type OwnBotOption = {
  id: string;
  name: string;
};

function errorFromBody(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    const trimmed = ((body as { error: string }).error || "").trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/**
 * Build POST /api/calibration/offerings body from the operator form.
 * Facilitator selection is the existing "provider:model" value used by MODEL_OPTIONS.
 */
export function buildOfferingCreatePayload(input: {
  title: string;
  sampleAppId: string;
  sampleRubric: string;
  deploymentBrief: string;
  transcriptExcerpt: string;
  facilitatorSelection: string;
  facilitatorApiKey?: string;
}): OfferingCreatePayload {
  const { provider, model } = parseModelSelection(
    input.facilitatorSelection.trim()
  );
  const facilitatorApiKey = input.facilitatorApiKey?.trim();
  return {
    title: input.title.trim(),
    sampleAppId: input.sampleAppId.trim(),
    sampleRubric: input.sampleRubric.trim(),
    deploymentBrief: input.deploymentBrief.trim(),
    transcriptExcerpt: input.transcriptExcerpt.trim(),
    aiProvider: provider,
    aiModel: model,
    ...(facilitatorApiKey ? { facilitatorApiKey } : {}),
  };
}

/** Parse GET /api/apps JSON used by AppGrid into own-bot select options. */
export function parseOwnBotsResponse(
  status: number,
  body: unknown
): ParseResult<{ apps: OwnBotOption[] }> {
  if (status !== 200) {
    return { ok: false, error: errorFromBody(body, "Failed to load bots") };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid apps response" };
  }
  const apps = (body as { apps?: unknown }).apps;
  if (!Array.isArray(apps)) {
    return { ok: false, error: "Invalid apps response" };
  }
  const options: OwnBotOption[] = [];
  for (const item of apps) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const id = (item as { id?: unknown }).id;
    const name = (item as { name?: unknown }).name;
    if (typeof id !== "string" || !id.trim()) continue;
    if (typeof name !== "string") continue;
    options.push({ id: id.trim(), name });
  }
  return { ok: true, apps: options };
}

/** Parse POST /api/calibration/offerings JSON for the created offering id. */
export function parseOfferingCreateResponse(
  status: number,
  body: unknown
): ParseResult<{ offeringId: string }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to create offering"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid offering response" };
  }
  const offering = (body as { offering?: unknown }).offering;
  if (!offering || typeof offering !== "object" || Array.isArray(offering)) {
    return { ok: false, error: "Invalid offering response" };
  }
  const offeringId = (offering as { id?: unknown }).id;
  if (typeof offeringId !== "string" || !offeringId.trim()) {
    return { ok: false, error: "Invalid offering response" };
  }
  return { ok: true, offeringId: offeringId.trim() };
}

export type OfferingListItem = {
  id: string;
  title: string;
  createdAt: string;
};

/** Parse GET /api/calibration/offerings (operator's own offerings). */
export function parseOfferingListResponse(
  status: number,
  body: unknown
): ParseResult<{ offerings: OfferingListItem[] }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to load offerings"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid offerings response" };
  }
  const raw = (body as { offerings?: unknown }).offerings;
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Invalid offerings response" };
  }
  const offerings: OfferingListItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id.trim()) continue;
    if (typeof rec.title !== "string") continue;
    if (typeof rec.createdAt !== "string") continue;
    offerings.push({
      id: rec.id.trim(),
      title: rec.title,
      createdAt: rec.createdAt,
    });
  }
  return { ok: true, offerings };
}
