"use client";

type ShareLinkCardProps = {
  title: string;
  description: string;
  url?: string;
  error?: string;
  actionLabel: string;
};

function ShareLinkCard({
  title,
  description,
  url,
  error,
  actionLabel,
}: ShareLinkCardProps) {
  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      {error ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
            <div className="break-all">{url}</div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Copy link
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
            >
              {actionLabel}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

export default function ShareDialog({
  open,
  appName,
  loading,
  savingSettings,
  error,
  projectUrl,
  chatbotUrl,
  chatbotError,
  projectShareVisibility,
  shareAuthorName,
  onProjectShareVisibilityChange,
  onShareAuthorNameChange,
  onSaveProjectSettings,
  onClose,
}: {
  open: boolean;
  appName: string;
  loading?: boolean;
  savingSettings?: boolean;
  error?: string;
  projectUrl?: string;
  chatbotUrl?: string;
  chatbotError?: string;
  projectShareVisibility: "private" | "public";
  shareAuthorName: boolean;
  onProjectShareVisibilityChange: (value: "private" | "public") => void;
  onShareAuthorNameChange: (value: boolean) => void;
  onSaveProjectSettings: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Share
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Share {appName}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose whether to share the full project for other teachers or the
              finished chatbot for students.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Preparing share links...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Project sharing settings
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block font-medium">Project visibility</span>
                    <select
                      value={projectShareVisibility}
                      onChange={(event) =>
                        onProjectShareVisibilityChange(
                          event.target.value as "private" | "public"
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="private">Private project</option>
                      <option value="public">Public project</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={shareAuthorName}
                      onChange={(event) =>
                        onShareAuthorNameChange(event.target.checked)
                      }
                    />
                    <span>Show author name on the shared project page</span>
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSaveProjectSettings}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                    disabled={savingSettings}
                  >
                    {savingSettings ? "Saving..." : "Update project sharing"}
                  </button>
                  <span className="text-xs text-slate-500">
                    Private project links stay accessible only to the owner.
                  </span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ShareLinkCard
                  title="Share project"
                  description="For other teacher-builders. Includes the prompt builder sections and the final system prompt in a read-only project view."
                  url={projectUrl}
                  error={
                    projectShareVisibility === "private"
                      ? "This project is private. Only you can open the project link until you switch it to public."
                      : undefined
                  }
                  actionLabel="Open project"
                />
                <ShareLinkCard
                  title="Share chatbot"
                  description="For students. Opens the finished standalone chatbot experience."
                  url={chatbotUrl}
                  error={chatbotError}
                  actionLabel="Open chatbot"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
