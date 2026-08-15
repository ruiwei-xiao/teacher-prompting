/**
 * Client-safe artifact helpers (Task 5.3).
 * Read-only view model for the sample bot prompt, brief, and transcript.
 * Does not import the calibration engine, store, or API modules.
 */

export type ArtifactsView = {
  systemPrompt: string;
  deploymentBrief: string;
  transcriptExcerpt: string;
  sampleAppId: string;
  publicSlug: string | null;
  tryChatHref: string;
};

export type TryChatApp = {
  id: string;
  publicSlug?: string | null;
};

/** Published student chat path. Never adds a query string. */
export function tryChatHref(app: TryChatApp): string {
  const slug = typeof app.publicSlug === "string" ? app.publicSlug.trim() : "";
  const id = typeof app.id === "string" ? app.id.trim() : "";
  return `/chat/${slug || id}`;
}

export function buildArtifactsView(input: {
  systemPrompt: string;
  deploymentBrief: string;
  transcriptExcerpt: string;
  sampleAppId: string;
  publicSlug?: string | null;
}): ArtifactsView {
  const publicSlug =
    typeof input.publicSlug === "string" && input.publicSlug.trim()
      ? input.publicSlug.trim()
      : null;
  return {
    systemPrompt: input.systemPrompt,
    deploymentBrief: input.deploymentBrief,
    transcriptExcerpt: input.transcriptExcerpt,
    sampleAppId: input.sampleAppId,
    publicSlug,
    tryChatHref: tryChatHref({
      id: input.sampleAppId,
      publicSlug,
    }),
  };
}

/** True when the view is display-only and try-chat has no override query. */
export function isReadOnlyArtifactView(
  view: Pick<ArtifactsView, "tryChatHref">
): boolean {
  if (!view.tryChatHref.startsWith("/chat/")) return false;
  if (view.tryChatHref.includes("?")) return false;
  return true;
}
