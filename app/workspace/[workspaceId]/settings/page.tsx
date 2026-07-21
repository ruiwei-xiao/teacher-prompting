import { redirect } from "next/navigation";
import { workspaceTabHref, type WorkspaceTab } from "@/lib/workspace-ui/tabs";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/** Legacy `/settings` URLs redirect onto the unified hub `?tab=` routes. */
export default async function WorkspaceSettingsRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: WorkspaceTab =
    raw === "invites" || raw === "members" || raw === "settings"
      ? raw
      : "settings";
  redirect(workspaceTabHref(workspaceId, tab));
}
