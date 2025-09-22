// components/dashboard/AppGrid.tsx
"use client";

import { useRouter } from "next/navigation";
import AppCard from "./AppCard";   // <-- default import

export default function AppGrid() {
  const router = useRouter();

  const cards = [
    { id: "pedagogical-prompting", title: "Chem 201 student support", desc: "Support for course learning objectives" },
    { id: "fgdfg", title: "fgdfg", desc: "dfg" },
    { id: "syllabot", title: "Syllabot", desc: "A quick-access guide to everything you need to know…" },
  ];

  return (
    <>
      <div className="mt-6 flex items-center gap-3">
        <input className="w-full h-10 px-3 rounded-lg border" placeholder="Search apps" />
        <select className="h-10 rounded-lg border px-3">
          <option>All apps</option><option>Playing</option><option>Draft</option>
        </select>
        <button
          onClick={() => router.push("/create")}
          className="h-10 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4"
        >
          New app
        </button>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <AppCard key={c.id} app={c} onEdit={() => router.push(`/app/${c.id}/editor`)} />
        ))}
      </div>
    </>
  );
}
