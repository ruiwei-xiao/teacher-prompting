import { auth } from "@/auth";
import SignInPanel from "@/components/auth/SignInPanel";
import SpaceLayout from "@/components/calibration/SpaceLayout";
import { getModelLabel } from "@/lib/app-store/model-selection";
import { getAppById } from "@/lib/app-store/store";
import { personOverlayFromUser } from "@/lib/auth/resolve-labels";
import { rubricCriterionKeys } from "@/lib/calibration-api/scores";
import { getSpace } from "@/lib/calibration-api/space";
import {
  getOffering,
  getTeam,
  getTeamForMember,
  listAddenda,
} from "@/lib/calibration-store/store";
import { buildArtifactsView } from "@/lib/calibration-ui/artifacts";
import { visibleRubricText } from "@/lib/calibration-ui/deliverable";
import { snapshotsFromDocs } from "@/lib/calibration-ui/docs";
import { teamSpacePath } from "@/lib/calibration-ui/gate";

export default async function TeamSpacePage({
  params,
}: {
  params: Promise<{ offeringId: string; teamId: string }>;
}) {
  const { offeringId, teamId } = await params;
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <SignInPanel
          callbackUrl={teamSpacePath(offeringId, teamId)}
          googleEnabled={Boolean(
            process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
          )}
          microsoftEnabled={Boolean(
            process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
              process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
              process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
          )}
        />
      </main>
    );
  }

  const result = await getSpace(session.user.id ?? null, teamId, {
    identity: personOverlayFromUser(session.user),
  });
  if (!result.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-4 py-10 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
        <div className="max-w-lg">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100">
            {result.status === 403 ? "Access denied" : "Team not found"}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
            {result.body.error}
          </p>
          <a
            href="/activity"
            className="mt-4 inline-block text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Back to activities
          </a>
        </div>
      </main>
    );
  }

  const [offering, teamView, team, addenda] = await Promise.all([
    getOffering(offeringId),
    getTeamForMember(teamId, session.user.id ?? ""),
    getTeam(teamId),
    listAddenda(teamId),
  ]);
  const sampleApp = offering?.sampleAppId
    ? await getAppById(offering.sampleAppId)
    : null;
  const artifacts = buildArtifactsView({
    sampleRubric: offering?.sampleRubric ?? "",
    systemPrompt: sampleApp?.systemPrompt ?? "",
    deploymentBrief: offering?.deploymentBrief ?? "",
    transcriptExcerpt: offering?.transcriptExcerpt ?? "",
    sampleAppId: offering?.sampleAppId ?? sampleApp?.id ?? "",
    publicSlug: sampleApp?.publicSlug ?? null,
  });
  const docSnapshots = snapshotsFromDocs(teamView?.docs);
  const rubricSnapshotText = docSnapshots.rubric;
  const rubricText = visibleRubricText(team?.finalRubric, rubricSnapshotText);
  const criterionKeys = rubricCriterionKeys(rubricText);

  return (
    <SpaceLayout
      teamId={teamId}
      viewerUserId={session.user.id ?? ""}
      title={offering?.title ?? "Activity"}
      initialSpace={result.body}
      artifacts={artifacts}
      criterionKeys={criterionKeys}
      snapshots={docSnapshots}
      sampleBot={{
        appId: sampleApp?.id ?? offering?.sampleAppId ?? "",
        appName: sampleApp?.name?.trim() || "Sample bot",
        modelLabel: sampleApp
          ? getModelLabel(sampleApp.provider, sampleApp.model)
          : "",
      }}
      deliverable={{
        autoFinalized: team?.autoFinalized ?? false,
        rubricText,
        flaggedCriteria: team?.state.flaggedCriteria ?? [],
        addenda,
      }}
    />
  );
}
