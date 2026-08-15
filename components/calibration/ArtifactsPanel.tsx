import type { ArtifactsView } from "@/lib/calibration-ui/artifacts";

function ArtifactBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
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
    <section
      aria-label="Artifacts"
      className="rounded-2xl border border-white/60 bg-white/70 px-4 py-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
          Artifacts
        </h2>
        <a
          href={artifacts.tryChatHref}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
        >
          Try chat
        </a>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
        Sample bot materials for this activity. These texts cannot be changed here.
      </p>
      <ArtifactBlock title="System prompt" text={artifacts.systemPrompt} />
      <ArtifactBlock title="Deployment brief" text={artifacts.deploymentBrief} />
      <ArtifactBlock title="Transcript excerpt" text={artifacts.transcriptExcerpt} />
    </section>
  );
}
