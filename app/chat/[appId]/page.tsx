import { auth } from "@/auth";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicChatPage } from "@/lib/chat/resolve-chat-config";
import PublishedChatbot from "@/components/public/PublishedChatbot";
import { publicChatCallbackPath } from "@/components/public/public-chat-gate";

type PublicChatPageProps = {
  params: Promise<{ appId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PublicChatPageProps): Promise<Metadata> {
  const { appId } = await params;
  const loaded = await loadPublicChatPage(appId);
  if (loaded.status !== "ok") {
    return {};
  }
  return { title: loaded.title };
}

export default async function PublicChatbotPage({
  params,
  searchParams,
}: PublicChatPageProps) {
  const { appId } = await params;
  const query = await searchParams;
  const session = await auth();
  const loaded = await loadPublicChatPage(appId);

  if (loaded.status !== "ok") {
    notFound();
  }

  return (
    <PublishedChatbot
      appId={loaded.appId}
      appName={loaded.title}
      systemPrompt={loaded.systemPrompt}
      isSignedIn={Boolean(session?.user)}
      signedInUser={
        session?.user
          ? {
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null,
            }
          : null
      }
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
