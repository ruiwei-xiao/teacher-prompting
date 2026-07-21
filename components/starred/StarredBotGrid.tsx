"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppCard from "@/components/dashboard/AppCard";
import {
  parseStarsListResponse,
  type EligibleStarSummary,
} from "@/lib/star-ui/stars-response";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";

export default function StarredBotGrid() {
  const router = useRouter();
  const [stars, setStars] = useState<EligibleStarSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStars() {
      setError("");
      try {
        const res = await fetch("/api/stars");
        const body = await res.json().catch(() => ({}));
        const parsed = parseStarsListResponse(res.status, body);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        setStars(parsed.stars);
      } catch (e: unknown) {
        setStars([]);
        setError(
          e instanceof Error ? e.message : "Failed to load starred bots"
        );
      }
    }

    void loadStars().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-slate-600 dark:text-zinc-300">
        Loading starred bots…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
          Starred
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
          {stars.length
            ? `You have ${stars.length} starred bot${stars.length === 1 ? "" : "s"}.`
            : "No eligible starred bots right now."}
        </p>
      </div>

      {stars.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {stars.map((star) => (
            <AppCard
              key={star.appId}
              badge={star.owned ? "Yours" : "Workspace"}
              title={star.title}
              desc={
                star.description ||
                "No description yet. Open this bot to continue."
              }
              meta={
                star.starredAt
                  ? `Starred ${new Date(star.starredAt).toLocaleDateString()}`
                  : undefined
              }
              ctaLabel="Open"
              onOpen={() => router.push(star.open.href)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            No starred bots yet
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
            Starred is empty. Star bots from My bots or from a Workspace bot
            list, then they will show up here.
          </p>
          <button
            type="button"
            onClick={() => router.push(MY_BOTS_HREF)}
            className="pressable mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition-[background-color] duration-200 hover:from-sky-600 hover:to-sky-700"
          >
            Go to My bots
          </button>
        </div>
      )}
    </div>
  );
}
