import { listConfigVersions } from "@/lib/app-config-versions/store";
import type { AppConfig, ProjectShareVisibility } from "@/lib/app-store/types";
import { normalizeVariability } from "@/lib/app-store/model-selection";

type VersionIdSource = {
  id: string;
  kind: string;
  sealedAt: string | null;
  createdAt: string;
};

export type OwnerAppSettings = {
  id: string;
  name: string;
  description?: string;
  provider: AppConfig["provider"];
  model: string;
  variability: number;
  systemPrompt: string;
  builderState: AppConfig["builderState"] | null;
  communitySubject: string | null;
  communityTags: string[];
  publishedAt: string | null;
  publicSlug: string | null;
  projectShareSlug: string | null;
  projectSharedAt: string | null;
  projectShareVisibility: ProjectShareVisibility;
  shareAuthorName: boolean;
  assistedAuthoringMode?: boolean;
  forkedFromProjectName: string | null;
  forkedFromProjectShareSlug: string | null;
  forkedFromAuthorName: string | null;
  createdAt: string;
  updatedAt: string;
  publishedVersionId: string | null;
  latestVersionId: string | null;
};

function compareCreated(a: VersionIdSource, b: VersionIdSource): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (aTime !== bTime) return aTime - bTime;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Unsealed edit version, or the published edit version when that draft is already sealed.
 */
export function selectLatestVersionId(
  versions: readonly VersionIdSource[],
  publishedVersionId: string | null | undefined
): string | null {
  const unsealed = versions.filter(
    (version) => version.kind === "edit" && version.sealedAt === null
  );
  if (unsealed.length > 0) {
    const latest = unsealed.reduce((best, version) =>
      compareCreated(version, best) > 0 ? version : best
    );
    return latest.id;
  }
  if (typeof publishedVersionId === "string" && publishedVersionId.length > 0) {
    return publishedVersionId;
  }
  return null;
}

export function withoutAppSecrets<T extends object>(
  app: T
): Omit<T, "apiKey" | "publishedApiKey"> {
  const record = app as T & { apiKey?: unknown; publishedApiKey?: unknown };
  const { apiKey: _draftKey, publishedApiKey: _publishedKey, ...rest } = record;
  return rest;
}

export async function toOwnerAppSettings(app: AppConfig): Promise<OwnerAppSettings> {
  const versions = await listConfigVersions(app.id);
  const latestVersionId = selectLatestVersionId(versions, app.publishedVersionId);
  const body: OwnerAppSettings = {
    id: app.id,
    name: app.name,
    description: app.description,
    provider: app.provider,
    model: app.model,
    variability: normalizeVariability(app.variability),
    systemPrompt: app.systemPrompt || "",
    builderState: app.builderState || null,
    communitySubject: app.communitySubject || null,
    communityTags: app.communityTags || [],
    publishedAt: app.publishedAt || null,
    publicSlug: app.publicSlug || null,
    projectShareSlug: app.projectShareSlug || null,
    projectSharedAt: app.projectSharedAt || null,
    projectShareVisibility: app.projectShareVisibility || "private",
    shareAuthorName: app.shareAuthorName ?? false,
    assistedAuthoringMode: app.assistedAuthoringMode,
    forkedFromProjectName: app.forkedFromProjectName || null,
    forkedFromProjectShareSlug: app.forkedFromProjectShareSlug || null,
    forkedFromAuthorName: app.forkedFromAuthorName || null,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    publishedVersionId: app.publishedVersionId ?? null,
    latestVersionId,
  };
  return body;
}
