import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApp, listApps } from "@/lib/app-store/store";
import { AppConfig } from "@/lib/app-store/types";
import {
  DEFAULT_VARIABILITY,
  normalizeVariability,
  parseModelSelection,
} from "@/lib/app-store/model-selection";
import {
  assertCreateIntoWorkspaceGate,
  placeAppIntoWorkspaceAfterCreate,
} from "@/lib/workspace-api/apps-gates";
import { createDefaultBotFields } from "@/lib/app-store/patch-validation";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "my-app"
  );
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listApps(userId);
  return NextResponse.json({
    apps: apps.map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      updatedAt: app.updatedAt,
      publishedAt: app.publishedAt || null,
      publicSlug: app.publicSlug || null,
      projectShareSlug: app.projectShareSlug || null,
      projectSharedAt: app.projectSharedAt || null,
      projectShareVisibility: app.projectShareVisibility || "private",
      shareAuthorName: app.shareAuthorName ?? false,
      communitySubject: app.communitySubject || null,
      communityTags: app.communityTags || [],
      forkedFromProjectName: app.forkedFromProjectName || null,
      forkedFromAuthorName: app.forkedFromAuthorName || null,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      genaiModel,
      genaiApiKey,
      workspaceId: workspaceIdRaw,
    }: {
      name: string;
      description?: string;
      genaiModel: string;
      genaiApiKey: string;
      workspaceId?: string;
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Missing app name" }, { status: 400 });
    }
    if (!genaiModel?.trim()) {
      return NextResponse.json({ error: "Missing model selection" }, { status: 400 });
    }
    if (!genaiApiKey?.trim()) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 });
    }

    const workspaceId =
      typeof workspaceIdRaw === "string" && workspaceIdRaw.trim()
        ? workspaceIdRaw.trim()
        : null;

    // Permission (a): deny before create when workspaceId is present but not allowed.
    const createGate = await assertCreateIntoWorkspaceGate({
      userId,
      workspaceId,
    });
    if (!createGate.ok) {
      return NextResponse.json(
        { error: createGate.error },
        { status: createGate.status }
      );
    }

    const id = slugify(name);
    const { provider, model } = parseModelSelection(genaiModel);
    const now = new Date().toISOString();
    const descriptionTrimmed =
      typeof description === "string" ? description.trim() : "";
    const defaults = createDefaultBotFields();

    const app: AppConfig = {
      id,
      ownerId: userId,
      name,
      description,
      provider,
      model,
      apiKey: genaiApiKey,
      variability: normalizeVariability(DEFAULT_VARIABILITY),
      ...(descriptionTrimmed ? { systemPrompt: descriptionTrimmed } : {}),
      assistedAuthoringMode: defaults.assistedAuthoringMode,
      createdAt: now,
      updatedAt: now,
    };

    const created = await createApp(app);

    if (workspaceId) {
      await placeAppIntoWorkspaceAfterCreate({
        userId,
        workspaceId,
        appId: created.id,
      });
    }

    return NextResponse.json({ app: created });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create app" },
      { status: 500 }
    );
  }
}
