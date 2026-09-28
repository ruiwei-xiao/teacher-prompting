import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import type { AppConfig, PromptBuilderState } from "@/lib/app-store/types";
import { diffConfigSnapshots } from "@/lib/app-config-versions/rules";
import { listConfigVersions } from "@/lib/app-config-versions/store";
import type { ConfigVersionRecord } from "@/lib/app-config-versions/types";

type PublicConfigVersion = {
  id: string;
  appId: string;
  kind: ConfigVersionRecord["kind"];
  createdAt: string;
  updatedAt: string;
  sealedAt: string | null;
  name: string;
  provider: string;
  model: string;
  variability: number | null;
  systemPrompt: string;
  assistedAuthoringMode: boolean;
  builderState: PromptBuilderState | null;
};

type OwnerGate =
  | { ok: true; app: AppConfig }
  | { ok: false; response: NextResponse };

function createdAtDelta(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function isBefore(candidate: ConfigVersionRecord, selected: ConfigVersionRecord): boolean {
  const created = createdAtDelta(candidate.createdAt, selected.createdAt);
  if (created < 0) return true;
  if (created > 0) return false;
  return candidate.id < selected.id;
}

// Closest older edit row. A shared createdAt uses the greatest smaller id
// only when that timestamp equals the selected row; otherwise the greatest
// strictly earlier createdAt wins, then the greatest id.
function previousEditVersion(
  versions: readonly ConfigVersionRecord[],
  selected: ConfigVersionRecord
): ConfigVersionRecord | null {
  let previous: ConfigVersionRecord | null = null;
  for (const version of versions) {
    if (version.kind !== "edit" || version.id === selected.id) continue;
    if (!isBefore(version, selected)) continue;
    if (previous === null || isBefore(previous, version)) {
      previous = version;
    }
  }
  return previous;
}

function toPublicVersion(version: ConfigVersionRecord): PublicConfigVersion {
  return {
    id: version.id,
    appId: version.appId,
    kind: version.kind,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    sealedAt: version.sealedAt,
    name: version.name,
    provider: version.provider,
    model: version.model,
    variability: version.variability,
    systemPrompt: version.systemPrompt,
    assistedAuthoringMode: version.assistedAuthoringMode,
    builderState: version.builderState,
  };
}

async function requireOwnerApp(appId: string): Promise<OwnerGate> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const app = await getAppById(appId, userId);
  if (!app) {
    return {
      ok: false,
      response: NextResponse.json({ error: "App not found" }, { status: 404 }),
    };
  }

  return { ok: true, app };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> }
) {
  const { appId, versionId } = await params;
  const owner = await requireOwnerApp(appId);
  if (!owner.ok) return owner.response;

  const versions = await listConfigVersions(appId);
  const selected = versions.find((version) => version.id === versionId);
  if (!selected || selected.kind !== "edit") {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const previous = previousEditVersion(versions, selected);
  return NextResponse.json({
    version: toPublicVersion(selected),
    previousVersionId: previous ? previous.id : null,
    diff: previous ? diffConfigSnapshots(previous, selected) : [],
  });
}
