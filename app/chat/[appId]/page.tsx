import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getAppById, getAppByPublicSlug } from "@/lib/app-store/store";
import PublishedChatbot from "@/components/public/PublishedChatbot";
import { publicChatCallbackPath } from "@/components/public/public-chat-gate";

export default async function PublicChatbotPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { appId } = await params;
  const query = await searchParams;
  const session = await auth();
  const app = (await getAppById(appId)) || (await getAppByPublicSlug(appId));

  if (!app || !app.publishedAt) {
    notFound();
  }

  return (
    <PublishedChatbot
      appId={app.id}
      appName={app.name || app.id}
      systemPrompt={app.systemPrompt || ""}
      isSignedIn={Boolean(session?.user)}
      chatCallbackUrl={publicChatCallbackPath(appId, query)}
      googleEnabled={Boolean(
        process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      )}
      microsoftEnabled={Boolean(
        process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
          process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
          process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
      )}
    />
  );
}
