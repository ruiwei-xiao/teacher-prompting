import SpaceLayout, { type SpaceAbsence } from "./SpaceLayout";
import type { ArtifactsView } from "@/lib/calibration-ui/artifacts";
import { type DeliverableSnapshot } from "@/lib/calibration-ui/deliverable";
import type { SharedDocSnapshots } from "@/lib/calibration-ui/docs";
import { operatePageHref } from "@/lib/calibration-ui/operator";
import type { SpaceView } from "@/lib/calibration-ui/space";

export default function OperatorTeamView({
  offeringId,
  teamId,
  viewerUserId,
  title,
  space,
  artifacts,
  criterionKeys,
  snapshots,
  sampleBot,
  deliverable,
  absences,
}: {
  offeringId: string;
  teamId: string;
  viewerUserId: string;
  title: string;
  space: SpaceView;
  artifacts: ArtifactsView;
  criterionKeys: string[];
  snapshots: SharedDocSnapshots;
  sampleBot: {
    appId: string;
    appName: string;
    modelLabel: string;
  };
  deliverable: DeliverableSnapshot;
  absences: SpaceAbsence[];
}) {
  return (
    <SpaceLayout
      teamId={teamId}
      viewerUserId={viewerUserId}
      title={title}
      initialSpace={space}
      artifacts={artifacts}
      criterionKeys={criterionKeys}
      snapshots={snapshots}
      sampleBot={sampleBot}
      deliverable={deliverable}
      absences={absences}
      backHref={operatePageHref(offeringId)}
      backAriaLabel="Back to progress"
    />
  );
}
