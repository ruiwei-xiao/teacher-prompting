import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/auth/user-store";
import SharedProjectEditor from "@/components/project/SharedProjectEditor";
import { forkApp } from "@/lib/app-store/fork";
import { getAppByProjectShareSlug } from "@/lib/app-store/store";

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

    const forked = await forkApp({
      source,
      ownerId: userId,
      forkedFromAuthorName: attributionName,
    });

    redirect(`/app/${forked.id}/editor`);
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
