import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteApp, getAppById, listApps, updateApp } from "@/lib/app-store/store";
import type { PromptBuilderState } from "@/lib/app-store/types";
import {
  normalizeVariability,
  parseModelSelection,
} from "@/lib/app-store/model-selection";
import {
  assertDeleteOwnBotGate,
  assertEducatorOutwardShareGate,
} from "@/lib/workspace-api/apps-gates";
import { validateAssistedAuthoringMode } from "@/lib/app-store/patch-validation";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "chatbot"
  );
}

async function buildUniqueSlug(
  baseValue: string,
  appId: string,
  field: "publicSlug" | "projectShareSlug"
) {
  const base = slugify(baseValue);
  const apps = await listApps();
  const used = new Set(
    apps
      .filter((app) => app.id !== appId)
      .map((app) => (field === "publicSlug" ? app.publicSlug : app.projectShareSlug))
      .filter(Boolean)
  );

  if (!used.has(base)) return base;

  let attempt = 2;
  while (used.has(`${base}-${attempt}`)) {
    attempt += 1;
  }

  return `${base}-${attempt}`;
}

async function buildUniquePublicSlug(name: string, appId: string) {
  return buildUniqueSlug(name, appId, "publicSlug");
}

async function buildUniqueProjectShareSlug(name: string, appId: string) {
  return buildUniqueSlug(`${name} project`, appId, "projectShareSlug");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await getAppById(appId, userId);

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  return NextResponse.json({
    app: {
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
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      name?: string;
      genaiModel?: string;
      genaiApiKey?: string;
      variability?: number;
      systemPrompt?: string;
      publish?: boolean;
      shareProject?: boolean;
      builderState?: PromptBuilderState;
      projectShareVisibility?: "private" | "public";
      shareAuthorName?: boolean;
      assistedAuthoringMode?: unknown;
      communitySubject?: string;
      communityTags?: string[];
      workspaceId?: string;
    };

    const existing = await getAppById(appId, userId);
    if (!existing) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    // Permission (c): educator-outward fields only, when Workspace context present.
    // Never gates student-facing publish (Req 5.7).
    const shareGate = await assertEducatorOutwardShareGate({
      userId,
      workspaceId: body.workspaceId,
      body,
    });
    if (!shareGate.ok) {
      return NextResponse.json(
        { error: shareGate.error },
        { status: shareGate.status }
      );
    }

    const patch: {
      name?: string;
      provider?: "openai" | "google" | "anthropic";
      model?: string;
      apiKey?: string;
      variability?: number;
      systemPrompt?: string;
      builderState?: PromptBuilderState;
      communitySubject?: string;
      communityTags?: string[];
      publishedAt?: string;
      publicSlug?: string;
      projectShareSlug?: string;
      projectSharedAt?: string;
      projectShareVisibility?: "private" | "public";
      shareAuthorName?: boolean;
      assistedAuthoringMode?: boolean;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "App name cannot be empty" },
          { status: 400 }
        );
      }
      patch.name = name;
    }

    if (body.genaiModel?.trim()) {
      const { provider, model } = parseModelSelection(body.genaiModel);
      patch.provider = provider;
      patch.model = model;
    }

    if (body.genaiApiKey?.trim()) {
      patch.apiKey = body.genaiApiKey.trim();
    }

    if (typeof body.variability === "number") {
      patch.variability = normalizeVariability(body.variability);
    }

    if (typeof body.systemPrompt === "string") {
      patch.systemPrompt = body.systemPrompt;
    }

    if (body.builderState && typeof body.builderState === "object") {
      patch.builderState = body.builderState;
    }

    if (typeof body.communitySubject === "string") {
      patch.communitySubject = body.communitySubject.trim();
    }

    if (Array.isArray(body.communityTags)) {
      patch.communityTags = body.communityTags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .slice(0, 8);
    }

    if (
      body.projectShareVisibility === "private" ||
      body.projectShareVisibility === "public"
    ) {
      patch.projectShareVisibility = body.projectShareVisibility;
    }

    if (typeof body.shareAuthorName === "boolean") {
      patch.shareAuthorName = body.shareAuthorName;
    }

    const assistedAuthoringValidation = validateAssistedAuthoringMode(body);
    if (!assistedAuthoringValidation.ok) {
      return NextResponse.json(
        { error: assistedAuthoringValidation.error },
        { status: assistedAuthoringValidation.status }
      );
    }
    if (assistedAuthoringValidation.value !== undefined) {
      patch.assistedAuthoringMode = assistedAuthoringValidation.value;
    }

    if (body.publish) {
      patch.publishedAt = new Date().toISOString();
      patch.publicSlug = await buildUniquePublicSlug(
        patch.name || existing.name,
        existing.id
      );
    }

    if (body.shareProject) {
      patch.projectSharedAt = new Date().toISOString();
      patch.projectShareSlug =
        existing.projectShareSlug ||
        (await buildUniqueProjectShareSlug(
          patch.name || existing.name,
          existing.id
        ));
      patch.projectShareVisibility =
        patch.projectShareVisibility ||
        existing.projectShareVisibility ||
        "private";
      patch.shareAuthorName =
        typeof patch.shareAuthorName === "boolean"
          ? patch.shareAuthorName
          : existing.shareAuthorName ?? false;
    }

    if (
      !patch.name &&
      !patch.provider &&
      !patch.model &&
      !patch.apiKey &&
      typeof patch.variability !== "number" &&
      typeof patch.systemPrompt !== "string" &&
      !patch.builderState &&
      typeof patch.communitySubject !== "string" &&
      !patch.communityTags &&
      !patch.publishedAt &&
      !patch.publicSlug &&
      !patch.projectShareSlug &&
      !patch.projectSharedAt
    ) {
      return NextResponse.json(
        { error: "No settings changes provided" },
        { status: 400 }
      );
    }

    const app = await updateApp(appId, patch, userId);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    return NextResponse.json({
      app: {
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
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update app settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getAppById(appId, userId);
    if (!existing) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    // Permission (d): prefer explicit workspaceId (body or query); else placements.
    let workspaceId: string | undefined;
    const queryWorkspaceId = req.nextUrl.searchParams.get("workspaceId");
    if (queryWorkspaceId?.trim()) {
      workspaceId = queryWorkspaceId.trim();
    } else {
      try {
        const body = (await req.json()) as { workspaceId?: unknown };
        if (typeof body?.workspaceId === "string" && body.workspaceId.trim()) {
          workspaceId = body.workspaceId.trim();
        }
      } catch {
        // DELETE with empty body is valid
      }
    }

    const deleteGate = await assertDeleteOwnBotGate({
      userId,
      appId,
      workspaceId,
    });
    if (!deleteGate.ok) {
      return NextResponse.json(
        { error: deleteGate.error },
        { status: deleteGate.status }
      );
    }

    const removed = await deleteApp(appId, userId);
    if (!removed) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, app: { id: removed.id, name: removed.name } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete app" },
      { status: 500 }
    );
  }
}