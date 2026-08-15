"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODEL_OPTIONS } from "@/lib/app-store/model-selection";
import { offeringGatePath } from "@/lib/calibration-ui/gate";
import {
  OFFERING_CREATE_API,
  OWN_BOTS_API,
  buildOfferingCreatePayload,
  parseOfferingCreateResponse,
  parseOwnBotsResponse,
  type OwnBotOption,
} from "@/lib/calibration-ui/offering";

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-emerald-700";

export default function OfferingCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sampleAppId, setSampleAppId] = useState("");
  const [sampleRubric, setSampleRubric] = useState("");
  const [deploymentBrief, setDeploymentBrief] = useState("");
  const [transcriptExcerpt, setTranscriptExcerpt] = useState("");
  const [facilitatorSelection, setFacilitatorSelection] = useState(
    MODEL_OPTIONS[0]?.value ?? "openai:gpt-5.4-mini"
  );
  const [bots, setBots] = useState<OwnBotOption[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);
  const [botsError, setBotsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBots() {
      setBotsError("");
      try {
        const res = await fetch(OWN_BOTS_API);
        const body = await res.json().catch(() => ({}));
        const parsed = parseOwnBotsResponse(res.status, body);
        if (cancelled) return;
        if (!parsed.ok) {
          setBots([]);
          setBotsError(parsed.error);
          return;
        }
        setBots(parsed.apps);
        setSampleAppId((current) => current || parsed.apps[0]?.id || "");
      } catch {
        if (!cancelled) {
          setBots([]);
          setBotsError("Failed to load bots");
        }
      } finally {
        if (!cancelled) setBotsLoading(false);
      }
    }

    void loadBots();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (!sampleAppId.trim()) {
      setError("Please select a sample bot.");
      return;
    }
    if (!sampleRubric.trim()) {
      setError("Please enter a sample rubric.");
      return;
    }
    if (!deploymentBrief.trim()) {
      setError("Please enter a deployment brief.");
      return;
    }
    if (!transcriptExcerpt.trim()) {
      setError("Please enter a transcript excerpt.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(OFFERING_CREATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildOfferingCreatePayload({
            title,
            sampleAppId,
            sampleRubric,
            deploymentBrief,
            transcriptExcerpt,
            facilitatorSelection,
          })
        ),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseOfferingCreateResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      router.push(offeringGatePath(parsed.offeringId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create offering");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="offering-title"
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
        >
          Title
        </label>
        <input
          id="offering-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Rubric Calibration — Week 3"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="offering-sample-bot"
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
        >
          Sample bot
        </label>
        <select
          id="offering-sample-bot"
          value={sampleAppId}
          onChange={(e) => setSampleAppId(e.target.value)}
          disabled={botsLoading || bots.length === 0}
          className={fieldClass}
        >
          {bots.length === 0 ? (
            <option value="">
              {botsLoading ? "Loading your bots…" : "No bots available"}
            </option>
          ) : (
            bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))
          )}
        </select>
        {!botsLoading && botsError && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {botsError}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="offering-sample-rubric"
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
        >
          Sample rubric
        </label>
        <textarea
          id="offering-sample-rubric"
          rows={5}
          value={sampleRubric}
          onChange={(e) => setSampleRubric(e.target.value)}
          placeholder="Criteria the team will critique…"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="offering-deployment-brief"
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
        >
          Deployment brief
        </label>
        <textarea
          id="offering-deployment-brief"
          rows={4}
          value={deploymentBrief}
          onChange={(e) => setDeploymentBrief(e.target.value)}
          placeholder="How and where the sample bot is used…"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="offering-transcript"
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
        >
          Transcript excerpt
        </label>
        <textarea
          id="offering-transcript"
          rows={4}
          value={transcriptExcerpt}
          onChange={(e) => setTranscriptExcerpt(e.target.value)}
          placeholder="A short sample conversation…"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="offering-facilitator"
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
        >
          Facilitator provider / model
        </label>
        <select
          id="offering-facilitator"
          value={facilitatorSelection}
          onChange={(e) => setFacilitatorSelection(e.target.value)}
          className={fieldClass}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center rounded-lg bg-sky-600 px-5 text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create offering"}
      </button>
    </form>
  );
}
