import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/auth/user-store";
import SharedProjectEditor from "@/components/project/SharedProjectEditor";
import {
  createApp,
  getAppByProjectShareSlug,
  listApps,
} from "@/lib/app-store/store";

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  const app = await getAppByProjectShareSlug(projectId);

  if (!app?.projectShareSlug) {
    notFound();
  }

  const isOwner = Boolean(session?.user?.id && session.user.id === app.ownerId);
  if (app.projectShareVisibility !== "public" && !isOwner) {
    notFound();
  }

  const owner = app.ownerId ? await getUserById(app.ownerId) : null;
  const visibleAuthorName = app.shareAuthorName
    ? owner?.name || owner?.email || "Unknown author"
    : "";

  async function duplicateProject() {
    "use server";

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      redirect(`/?callbackUrl=${encodeURIComponent(`/project/${projectId}`)}`);
    }

    const source = await getAppByProjectShareSlug(projectId);
    if (!source) {
      notFound();
    }

    const sourceOwner = source.ownerId ? await getUserById(source.ownerId) : null;
    const attributionName = source.shareAuthorName
      ? sourceOwner?.name || sourceOwner?.email || "Unknown author"
      : "Anonymous teacher";

    const allApps = await listApps();
    const userApps = await listApps(userId);
    const baseId =
      `${source.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") || "project"}-copy`;
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
    await createApp({
      id: nextId,
      ownerId: userId,
      name: nextName,
      description: source.description,
      provider: source.provider,
      model: source.model,
      apiKey: "",
      variability: source.variability,
      systemPrompt: source.systemPrompt,
      builderState: source.builderState,
      forkedFromProjectName: source.name,
      forkedFromProjectShareSlug: source.projectShareSlug,
      forkedFromAuthorName: attributionName,
      createdAt: now,
      updatedAt: now,
    });

    redirect(`/app/${nextId}/editor`);
  }

  return (
    <>
      {!session?.user && (
        <div className="border-b bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
          Want to reuse this project?{" "}
          <Link
            href={`/?callbackUrl=${encodeURIComponent(`/project/${projectId}`)}`}
            className="font-medium text-sky-700 underline underline-offset-2"
          >
            Sign in to duplicate it
          </Link>
          .
        </div>
      )}
      <SharedProjectEditor
        app={app}
        visibleAuthorName={visibleAuthorName}
        duplicateAction={duplicateProject}
      />
    </>
  );
}
