"use client";

import { useState } from "react";

export default function CreateAppForm({ onCreate }: { onCreate: (id: string) => void }) {
  const [name, setName] = useState("PEDAGOGICAL-PROMPTING");
  const [desc, setDesc] = useState("Support for course learning objectives");
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") || "my-app";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onCreate(slugify(name)); }}
      className="space-y-6"
    >
      <div>
        <label className="block text-sm font-medium mb-1">App Name</label>
        <input
          className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My awesome app"
        />
        <p className="mt-1 text-xs text-slate-500">You can change this later if needed.</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">App Description</label>
        <textarea
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white p-3"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What does your app do?"
        />
      </div>
      <button type="submit" className="inline-flex items-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white h-11 px-5">
        Create App
      </button>
    </form>
  );
}
