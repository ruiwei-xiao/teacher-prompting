"use client";

export default function PublishDialog({
  open,
  url,
  error,
  onClose,
}: {
  open: boolean;
  url: string;
  error?: string;
  onClose: () => void;
}) {
  if (!open) return null;

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Publish
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Publish result
            </h2>
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
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : url ? (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <div className="text-sm font-semibold text-emerald-900">
                  Chatbot is live.
                </div>
                <p className="mt-1 text-sm text-emerald-900/90">
                  Share the link with your students. You can keep editing and
                  publish again anytime to update the live version.
                </p>
                <div className="mt-3 break-all text-sm text-slate-800">{url}</div>
              </div>

              <div className="flex items-center gap-2">
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
                  Open chatbot
                </a>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
