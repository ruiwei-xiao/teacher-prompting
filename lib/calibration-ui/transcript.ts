/**
 * Client-safe transcript-draft helpers for the activity create form.
 * Does not import the calibration engine, store, or API modules.
 */

export const TRANSCRIPT_GENERATE_API =
  "/api/calibration/offerings/generate-transcript";

export type ParseOk<T> = { ok: true } & T;
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

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

export function generateTranscriptPostBody(input: {
  sampleAppId: string;
  deploymentBrief?: string;
}): { sampleAppId: string; deploymentBrief: string } {
  return {
    sampleAppId: input.sampleAppId.trim(),
    deploymentBrief: (input.deploymentBrief ?? "").trim(),
  };
}

/** Turn simulated chat messages into a Student/Tutor excerpt. Skips the opening welcome. */
export function formatTranscriptExcerpt(
  messages: Array<{ role?: string; content?: string }>
): string {
  const lines: string[] = [];
  let started = false;
  for (const message of messages) {
    const role = typeof message.role === "string" ? message.role : "";
    const content =
      typeof message.content === "string" ? message.content.trim() : "";
    if (!content) continue;
    if (!started && role !== "user") continue;
    started = true;
    const speaker = role === "user" ? "Student" : "Tutor";
    lines.push(`${speaker}: ${content}`);
  }
  return lines.join("\n\n");
}

export function parseTranscriptGenerateResponse(
  status: number,
  body: unknown
): ParseResult<{ transcriptExcerpt: string }> {
  if (status !== 200) {
    return {
      ok: false,
      error: errorFromBody(body, "Failed to generate transcript"),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid transcript response" };
  }
  const excerpt = (body as { transcriptExcerpt?: unknown }).transcriptExcerpt;
  if (typeof excerpt !== "string" || !excerpt.trim()) {
    return { ok: false, error: "Invalid transcript response" };
  }
  return { ok: true, transcriptExcerpt: excerpt.trim() };
}
