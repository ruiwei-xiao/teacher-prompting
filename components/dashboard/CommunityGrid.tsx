import { getUserById } from "@/lib/auth/user-store";
import { listApps } from "@/lib/app-store/store";
import CommunityGallery, { type CommunityCard } from "./CommunityGallery";

function inferSubject(text: string) {
  const normalized = text.toLowerCase();

  if (/(python|javascript|coding|programming|debug|loop|algorithm|computer science|code)/.test(normalized)) {
    return "Computer Science";
  }
  if (/(chemistry|reaction|lab|molecule|acid|base|chemical)/.test(normalized)) {
    return "Chemistry";
  }
  if (/(music|staff|melody|rhythm|note|sing)/.test(normalized)) {
    return "Music";
  }
  if (/(dyslexia|reading|literacy|writing|phonics|language arts)/.test(normalized)) {
    return "Literacy";
  }
  if (/(math|algebra|geometry|fraction|equation|number)/.test(normalized)) {
    return "Math";
  }
  if (/(history|civics|geography|society|social studies)/.test(normalized)) {
    return "Social Studies";
  }
  if (/(biology|physics|science)/.test(normalized)) {
    return "Science";
  }
  if (/(spanish|french|vocabulary|language learning|foreign language|grammar)/.test(normalized)) {
    return "Language Learning";
  }

  return "General";
}

export default async function CommunityGrid() {
  const apps = await listApps();
  const publishedApps = apps
    .filter((app) => app.publishedAt)
    .sort((left, right) =>
      new Date(right.publishedAt || right.updatedAt).getTime() -
      new Date(left.publishedAt || left.updatedAt).getTime()
    );

  const duplicateCounts = new Map<string, number>();
  for (const app of apps) {
    if (!app.forkedFromProjectShareSlug) continue;
    duplicateCounts.set(
      app.forkedFromProjectShareSlug,
      (duplicateCounts.get(app.forkedFromProjectShareSlug) || 0) + 1
    );
  }

  const cards: CommunityCard[] = await Promise.all(
    publishedApps.map(async (app) => {
      const owner =
        app.shareAuthorName && app.ownerId ? await getUserById(app.ownerId) : null;
      const template =
        app.builderState?.selectedTemplate?.trim() &&
        app.builderState.selectedTemplate !== "— Select a template —"
          ? app.builderState.selectedTemplate
          : "Custom";
      const subject = inferSubject(
        [
          app.description || "",
          app.builderState?.learningObjectivePrompt || "",
          app.builderState?.learningObjective || "",
          app.systemPrompt || "",
        ].join(" ")
      );
      const finalSubject = app.communitySubject?.trim() || subject;

      return {
        id: app.id,
        name: app.name,
        description:
          app.description ||
          "Published chatbot ready for students and other teachers to explore.",
        updatedAt: app.updatedAt,
        publishedAt: app.publishedAt || app.updatedAt,
        publicSlug: app.publicSlug || app.id,
        projectShareSlug:
          app.projectShareVisibility === "public"
            ? app.projectShareSlug || null
            : null,
        authorName: owner?.name || owner?.email || "",
        template,
        subject: finalSubject,
        tags: app.communityTags || [],
        duplicateCount:
          app.projectShareSlug ? duplicateCounts.get(app.projectShareSlug) || 0 : 0,
      };
    })
  );

  if (!cards.length) {
    return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">
          No published community bots yet
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Publish a bot to make it discoverable here for the community.
        </p>
      </div>
    );
  }

  return <CommunityGallery cards={cards} />;
}
