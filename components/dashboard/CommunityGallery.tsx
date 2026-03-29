"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type CommunityCard = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  publishedAt: string;
  publicSlug: string;
  projectShareSlug: string | null;
  authorName: string;
  template: string;
  subject: string;
  tags: string[];
  duplicateCount: number;
};

export default function CommunityGallery({
  cards,
}: {
  cards: CommunityCard[];
}) {
  const [templateFilter, setTemplateFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "most-duplicated">("newest");

  const templateOptions = useMemo(
    () => ["all", ...new Set(cards.map((card) => card.template))],
    [cards]
  );
  const subjectOptions = useMemo(
    () => ["all", ...new Set(cards.map((card) => card.subject))],
    [cards]
  );

  const visibleCards = useMemo(() => {
    return [...cards]
      .filter((card) =>
        templateFilter === "all" ? true : card.template === templateFilter
      )
      .filter((card) =>
        subjectFilter === "all" ? true : card.subject === subjectFilter
      )
      .sort((left, right) => {
        if (sortBy === "most-duplicated") {
          if (right.duplicateCount !== left.duplicateCount) {
            return right.duplicateCount - left.duplicateCount;
          }
        }

        return (
          new Date(right.publishedAt || right.updatedAt).getTime() -
          new Date(left.publishedAt || left.updatedAt).getTime()
        );
      });
  }, [cards, sortBy, subjectFilter, templateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none md:flex-row md:items-end md:justify-between">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-slate-700 dark:text-zinc-300">
            <span className="mb-1 block font-medium">Template</span>
            <select
              value={templateFilter}
              onChange={(event) => setTemplateFilter(event.target.value)}
              className="h-11 min-w-[220px] rounded-2xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {templateOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All templates" : option}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700 dark:text-zinc-300">
            <span className="mb-1 block font-medium">Subject</span>
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="h-11 min-w-[180px] rounded-2xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {subjectOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All subjects" : option}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700 dark:text-zinc-300">
            <span className="mb-1 block font-medium">Sort by</span>
            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as "newest" | "most-duplicated")
              }
              className="h-11 min-w-[180px] rounded-2xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="newest">Newest</option>
              <option value="most-duplicated">Most duplicated</option>
            </select>
          </label>
        </div>

        <div className="text-sm text-slate-500 dark:text-zinc-400">
          Showing {visibleCards.length} of {cards.length} published bots
        </div>
      </div>

      {visibleCards.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {visibleCards.map((app) => (
            <div
              key={app.id}
              className={[
                "flex h-full flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-[box-shadow,border-color] hover:shadow-[0_16px_40px_rgba(15,23,42,0.09)]",
                "dark:border-zinc-500/80 dark:bg-zinc-800 dark:shadow-[0_0_0_1px_rgba(148,163,184,0.22),0_4px_28px_-6px_rgba(56,189,248,0.2),0_14px_44px_-14px_rgba(14,165,233,0.08)]",
                "dark:hover:border-sky-400/40 dark:hover:shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_8px_36px_-4px_rgba(56,189,248,0.26),0_22px_56px_-12px_rgba(14,165,233,0.14)]",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-200">
                  Published
                </span>
                <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-700 dark:bg-violet-950/80 dark:text-violet-200">
                  {app.template}
                </span>
                <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-700 dark:bg-sky-950/80 dark:text-sky-200">
                  {app.subject}
                </span>
                {app.authorName && (
                  <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
                    By {app.authorName}
                  </span>
                )}
              </div>

              <h3 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-zinc-100">{app.name}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-zinc-300">
                {app.description}
              </p>

              {app.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {app.tags.map((tag) => (
                    <span
                      key={`${app.id}-${tag}`}
                      className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <span>Published {new Date(app.publishedAt).toLocaleDateString()}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-zinc-800 dark:text-zinc-300">
                  {app.duplicateCount} duplicate{app.duplicateCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5 dark:border-zinc-600/60">
                <Link
                  href={`/chat/${app.publicSlug}`}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-sm transition hover:translate-y-[-1px] hover:from-sky-600 hover:to-sky-700"
                >
                  Open chatbot
                </Link>
                {app.projectShareSlug && (
                  <Link
                    href={`/project/${app.projectShareSlug}`}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:translate-y-[-1px] hover:border-slate-400 hover:bg-slate-50 dark:border-zinc-500/70 dark:bg-zinc-900/85 dark:text-zinc-100 dark:hover:border-sky-400/35 dark:hover:bg-zinc-900"
                  >
                    View project
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            No bots match these filters
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
            Try switching template, subject, or sort options.
          </p>
        </div>
      )}
    </div>
  );
}
