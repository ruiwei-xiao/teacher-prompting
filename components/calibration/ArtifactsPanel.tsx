import type { ArtifactsView } from "@/lib/calibration-ui/artifacts";

function ArtifactBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
        {title}
      </h3>
      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-zinc-200">
        {text || "—"}
      </pre>
    </div>
  );
}

export default function ArtifactsPanel({
  artifacts,
}: {
  artifacts: ArtifactsView;
}) {
  return (
    <section aria-label="Sample materials" className="space-y-4">
      <ArtifactBlock title="Sample rubric" text={artifacts.sampleRubric} />
      <ArtifactBlock title="System prompt" text={artifacts.systemPrompt} />
      <ArtifactBlock title="Deployment brief" text={artifacts.deploymentBrief} />
      <ArtifactBlock title="Transcript excerpt" text={artifacts.transcriptExcerpt} />
    </section>
  );
}
