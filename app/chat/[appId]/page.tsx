import { notFound } from "next/navigation";
import { getAppById, getAppByPublicSlug } from "@/lib/app-store/store";
import PublishedChatbot from "@/components/public/PublishedChatbot";

export default async function PublicChatbotPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const app = (await getAppById(appId)) || (await getAppByPublicSlug(appId));

  if (!app || !app.publishedAt) {
    notFound();
  }

  return (
    <PublishedChatbot
      appId={app.id}
      appName={app.name || app.id}
      systemPrompt={app.systemPrompt || ""}
    />
  );
}
