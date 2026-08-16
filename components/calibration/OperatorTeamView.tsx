import {
  labelForUserId,
  operatePageHref,
  type InspectorView,
} from "@/lib/calibration-ui/operator";

function criterionKeys(view: InspectorView): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of view.scores) {
    for (const score of row.scores) {
      if (seen.has(score.criterionKey)) continue;
      seen.add(score.criterionKey);
      keys.push(score.criterionKey);
    }
  }
  return keys;
}

function scoreValue(
  row: InspectorView["scores"][number],
  key: string
): string {
  const found = row.scores.find((score) => score.criterionKey === key);
  return found ? String(found.value) : "—";
}

function SnapshotBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
        {title}
      </h2>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-zinc-200">
        {text || "No snapshot yet."}
      </pre>
    </div>
  );
}

export default function OperatorTeamView({
  offeringId,
  view,
}: {
  offeringId: string;
  view: InspectorView;
}) {
  const keys = criterionKeys(view);
  const held = view.revealedAt === null;
  const deliverable = view.finalDeliverable;

  return (
    <section className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Team inspector
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-zinc-100">
          Read-only team view
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">
          Phase {view.phase}
          {view.locked ? " · Locked" : ""}. You are a viewer — chat, documents,
          and scores cannot be changed from here.
        </p>
        <a
          href={operatePageHref(offeringId)}
          className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
        >
          Back to progress
        </a>
      </header>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Group chat
        </h2>
        {view.messages.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-zinc-500">
            No messages yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {view.messages.map((message) => {
              const facilitator = message.authorKind === "facilitator";
              return (
                <li key={message.id}>
                  <article
                    className={
                      facilitator
                        ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/40"
                        : "rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
                    }
                  >
                    <p
                      className={
                        facilitator
                          ? "text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"
                          : "text-xs font-medium text-slate-500 dark:text-zinc-400"
                      }
                    >
                      {facilitator
                        ? "Facilitator"
                        : message.authorUserId
                          ? labelForUserId(message.authorUserId, view.labels)
                          : "Learner"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-zinc-200">
                      {message.body}
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <SnapshotBlock title="Shared rubric" text={view.rubricSnapshot} />
      <SnapshotBlock title="Shared notes" text={view.notesSnapshot} />

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Scores
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          {held
            ? "Held scores — members cannot see these values yet."
            : "Revealed to members."}
        </p>
        {view.scores.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-zinc-500">
            No scores submitted yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Member</th>
                  {keys.map((key) => (
                    <th key={key} className="py-2 pr-4 font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.scores.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-b border-slate-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-4 text-slate-900 dark:text-zinc-100">
                      {labelForUserId(row.userId, view.labels)}
                    </td>
                    {keys.map((key) => (
                      <td
                        key={key}
                        className="py-2 pr-4 text-slate-700 dark:text-zinc-300"
                      >
                        {scoreValue(row, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Absences
        </h2>
        {view.absences.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-zinc-500">
            No absence marks.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-zinc-300">
            {view.absences.map((row) => (
              <li key={`${row.userId}:${row.stepKey}:${row.markedAt}`}>
                {labelForUserId(row.userId, view.labels)} · {row.stepKey} ·{" "}
                {row.markedAt}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Final deliverable
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          {deliverable.autoFinalized ? "Auto-finalized." : "Not auto-finalized."}
          {deliverable.finalizedAt ? ` Locked ${deliverable.finalizedAt}.` : ""}
        </p>
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-zinc-200">
          {deliverable.finalRubric || "No locked final rubric yet."}
        </pre>
        {deliverable.addenda.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-zinc-300">
            {deliverable.addenda.map((row) => (
              <li key={row.id}>
                <span className="font-medium text-slate-900 dark:text-zinc-100">
                  {labelForUserId(row.userId, view.labels)}
                </span>
                {": "}
                {row.body}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
