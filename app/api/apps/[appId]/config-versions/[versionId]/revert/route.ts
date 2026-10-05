import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { revertToConfigVersion } from "@/lib/app-config-versions/store";
import type { ConfigVersionRecord } from "@/lib/app-config-versions/types";
import { getAppById } from "@/lib/app-store/store";
import type { AppConfig, PromptBuilderState } from "@/lib/app-store/types";

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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> }
) {
  const { appId, versionId } = await params;
  const owner = await requireOwnerApp(appId);
  if (!owner.ok) return owner.response;

  try {
    const result = await revertToConfigVersion({
      app: owner.app,
      sourceVersionId: versionId,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      if (result.code === "is-draft") {
        return NextResponse.json(
          { error: "The current draft cannot be reverted." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    return NextResponse.json({
      version: toPublicVersion(result.created),
      draft: result.draft,
    });
  } catch {
    return NextResponse.json({ error: "Failed to revert this version." }, { status: 500 });
  }
}
