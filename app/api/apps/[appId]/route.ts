import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteApp, getAppById, updateApp } from "@/lib/app-store/store";
import {
  normalizeVariability,
  parseModelSelection,
} from "@/lib/app-store/model-selection";

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
      publishedAt: app.publishedAt || null,
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
    };

    const existing = await getAppById(appId, userId);
    if (!existing) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const patch: {
      name?: string;
      provider?: "openai" | "google" | "anthropic";
      model?: string;
      apiKey?: string;
      variability?: number;
      systemPrompt?: string;
      publishedAt?: string;
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

    if (body.publish) {
      patch.publishedAt = new Date().toISOString();
    }

    if (
      !patch.name &&
      !patch.provider &&
      !patch.model &&
      !patch.apiKey &&
      typeof patch.variability !== "number" &&
      typeof patch.systemPrompt !== "string" &&
      !patch.publishedAt
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
        publishedAt: app.publishedAt || null,
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
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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