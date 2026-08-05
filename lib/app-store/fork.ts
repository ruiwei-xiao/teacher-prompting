import { createApp, listApps } from "@/lib/app-store/store";
import type { AppConfig } from "@/lib/app-store/types";

export type ForkAppParams = {
  source: AppConfig;
  ownerId: string;
  forkedFromAuthorName: string;
};

/**
 * Clone a bot into a caller-owned app with forkedFrom* attribution and empty apiKey.
 * Shared by project-share duplicate and Workspace peer duplicate.
 */
export async function forkApp({
  source,
  ownerId,
  forkedFromAuthorName,
}: ForkAppParams): Promise<AppConfig> {
  const allApps = await listApps();
  const userApps = await listApps(ownerId);
  const baseId =
    `${source.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "project"}-copy`;
  const usedIds = new Set(allApps.map((item) => item.id));
  let nextId = baseId;
  let attempt = 2;
  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${attempt}`;
    attempt += 1;
  }

  const baseName = `${source.name} Copy`;
  const usedNames = new Set(userApps.map((item) => item.name));
  let nextName = baseName;
  attempt = 2;
  while (usedNames.has(nextName)) {
    nextName = `${baseName} ${attempt}`;
    attempt += 1;
  }

  const now = new Date().toISOString();
  return createApp({
    id: nextId,
    ownerId,
    name: nextName,
    description: source.description,
    provider: source.provider,
    model: source.model,
    apiKey: "",
    variability: source.variability,
    systemPrompt: source.systemPrompt,
    builderState: source.builderState,
    assistedAuthoringMode: source.assistedAuthoringMode,
    forkedFromProjectName: source.name,
    forkedFromProjectShareSlug: source.projectShareSlug,
    forkedFromAuthorName,
    createdAt: now,
    updatedAt: now,
  });
}
