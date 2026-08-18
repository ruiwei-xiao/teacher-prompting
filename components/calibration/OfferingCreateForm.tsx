"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODEL_OPTIONS } from "@/lib/app-store/model-selection";
import { operatePageHref } from "@/lib/calibration-ui/operator";
import {
  OFFERING_CREATE_API,
  OWN_BOTS_API,
  buildOfferingCreatePayload,
  parseOfferingCreateResponse,
  parseOwnBotsResponse,
  type OwnBotOption,
} from "@/lib/calibration-ui/offering";
import {
  TRANSCRIPT_GENERATE_API,
  generateTranscriptPostBody,
  parseTranscriptGenerateResponse,
} from "@/lib/calibration-ui/transcript";

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-emerald-700";

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
  const [facilitatorKeySource, setFacilitatorKeySource] = useState<
    "bot" | "custom"
  >("bot");
  const [facilitatorApiKey, setFacilitatorApiKey] = useState("");
  const [bots, setBots] = useState<OwnBotOption[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);
  const [botsError, setBotsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generateError, setGenerateError] = useState("");

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

  async function handleGenerateTranscript() {
    setGenerateError("");
    if (!sampleAppId.trim()) {
      setGenerateError("Please select a sample bot first.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(TRANSCRIPT_GENERATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          generateTranscriptPostBody({
            sampleAppId,
            deploymentBrief,
          })
        ),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseTranscriptGenerateResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      setTranscriptExcerpt(parsed.transcriptExcerpt);
    } catch (e: unknown) {
      setGenerateError(
        e instanceof Error ? e.message : "Failed to generate transcript"
      );
    } finally {
      setGenerating(false);
    }
  }

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
    if (facilitatorKeySource === "custom" && !facilitatorApiKey.trim()) {
      setError("Please enter a facilitator API key, or use the sample bot's key.");
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
            facilitatorApiKey:
              facilitatorKeySource === "custom" ? facilitatorApiKey : undefined,
          })
        ),
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseOfferingCreateResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      router.push(operatePageHref(parsed.offeringId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create activity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
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
            placeholder="Week 3 team activity"
            className={fieldClass}
          />
        </div>

        <div className="space-y-2">
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
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {botsError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
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

      <div className="space-y-2">
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label
            htmlFor="offering-transcript"
            className="block text-sm font-medium text-slate-700 dark:text-zinc-300"
          >
            Transcript excerpt
          </label>
          <button
            type="button"
            onClick={() => void handleGenerateTranscript()}
            disabled={generating || busy || !sampleAppId.trim()}
            className="pressable inline-flex h-9 items-center rounded-xl border border-sky-200 bg-sky-50 px-3.5 text-sm font-semibold text-sky-800 shadow-sm hover-ok:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200 dark:hover-ok:bg-sky-900/60"
          >
            {generating ? "Generating…" : "Generate draft"}
          </button>
        </div>
        <textarea
          id="offering-transcript"
          rows={6}
          value={transcriptExcerpt}
          onChange={(e) => setTranscriptExcerpt(e.target.value)}
          placeholder="A short sample conversation…"
          disabled={generating}
          className={`${fieldClass} transition-[opacity,filter] duration-200 ease-out ${
            generating ? "pointer-events-none opacity-60 blur-[1px]" : ""
          }`}
        />
        {generateError && (
          <p className="text-xs text-red-700 dark:text-red-300">
            {generateError}
          </p>
        )}
      </div>

      <div className="space-y-2">
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700 dark:text-zinc-300">
          Facilitator API key
        </legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-zinc-300">
          <input
            type="radio"
            name="facilitator-key-source"
            className="mt-1"
            checked={facilitatorKeySource === "bot"}
            onChange={() => setFacilitatorKeySource("bot")}
          />
          <span>Use the sample bot&apos;s API key</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-zinc-300">
          <input
            type="radio"
            name="facilitator-key-source"
            className="mt-1"
            checked={facilitatorKeySource === "custom"}
            onChange={() => setFacilitatorKeySource("custom")}
          />
          <span>Use a different API key</span>
        </label>
        {facilitatorKeySource === "custom" && (
          <input
            id="offering-facilitator-key"
            type="password"
            autoComplete="off"
            value={facilitatorApiKey}
            onChange={(e) => setFacilitatorApiKey(e.target.value)}
            placeholder="Provider API key for the facilitator model"
            className={fieldClass}
          />
        )}
      </fieldset>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || generating}
          className="pressable inline-flex h-11 items-center rounded-xl bg-sky-700 px-5 text-sm font-semibold text-white shadow-sm hover-ok:bg-sky-800 disabled:opacity-50 dark:bg-sky-600 dark:hover-ok:bg-sky-500"
        >
          {busy ? "Creating…" : "Create activity"}
        </button>
      </div>
    </form>
  );
}
