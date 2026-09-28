import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAppById } from "@/lib/app-store/store";
import type { AppConfig } from "@/lib/app-store/types";
import { listConfigVersions } from "@/lib/app-config-versions/store";
import type { ConfigVersionRecord } from "@/lib/app-config-versions/types";

type ConfigVersionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  isPublished: boolean;
};

type OwnerGate =
  | { ok: true; app: AppConfig }
  | { ok: false; response: NextResponse };

function compareHistory(a: ConfigVersionRecord, b: ConfigVersionRecord): number {
  const updated = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  if (updated !== 0) return updated;
  const created = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (created !== 0) return created;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function toSummary(
  version: ConfigVersionRecord,
  publishedVersionId: string | null | undefined
): ConfigVersionSummary {
  return {
    id: version.id,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    isDraft: version.sealedAt === null,
    isPublished: version.id === publishedVersionId,
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
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const owner = await requireOwnerApp(appId);
  if (!owner.ok) return owner.response;

  const versions = await listConfigVersions(appId);
  const summaries = versions
    .filter((version) => version.kind === "edit")
    .sort(compareHistory)
    .map((version) => toSummary(version, owner.app.publishedVersionId));

  return NextResponse.json({ versions: summaries });
}
