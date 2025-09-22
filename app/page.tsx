/* A two-pane UI that mirrors the screenshot:
   - App bar with title, model/variability, and Build/Design tabs
   - Left pane: card with “Learning Objectives Bot” + Start
   - Right pane: faux rich-text editor with toolbar + content
*/
import { Fragment } from "react";

function Pill({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`px-4 py-2 rounded-full text-sm font-medium border transition
      ${active
        ? "bg-slate-900 text-white border-slate-900"
        : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"}`}
      type="button"
    >
      {children}
    </button>
  );
}

function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top App Bar */}
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Left: back + title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-2 rounded-md hover:bg-slate-100"
              aria-label="Back"
            >
              <Icon d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">playlab.ai/build/cm7…</span>
              <span className="w-[1px] h-5 bg-slate-200" />
              <h1 className="text-[15px] font-semibold">Learning Objectives Bot</h1>
              <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          </div>

          {/* Center: tabs */}
          <div className="hidden sm:flex items-center gap-2">
            <Pill>Build</Pill>
            <Pill active>Design</Pill>
          </div>

          {/* Right: model + variability */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded-md bg-slate-100">Claude 3.5 Haiku</span>
              <span className="text-slate-400">with</span>
              <span className="px-2 py-1 rounded-md bg-slate-100">70% variability</span>
            </div>
            <button
              type="button"
              className="p-2 rounded-md hover:bg-slate-100"
              aria-label="More"
            >
              <Icon d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Pane */}
          <section className="bg-white border rounded-2xl shadow-sm p-6 flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm text-center">
                <div className="mx-auto mb-6 h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Icon
                    d="M4 4h16v2H4V4zm2 5h12v2H6V9zm-2 5h16v2H4v-2zm2 5h12v2H6v-2z"
                    className="w-6 h-6"
                  />
                </div>
                <h2 className="text-lg font-semibold">Learning Objectives Bot</h2>
                <p className="mt-2 text-sm text-slate-600">
                  This bot will help teachers create learning objectives.
                </p>
                <button
                  type="button"
                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-sky-600 text-white h-10 px-4 text-sm font-medium hover:bg-sky-700"
                >
                  Start
                </button>
              </div>
            </div>
          </section>

          {/* Right Pane (Editor) */}
          <section className="bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Faux editor toolbar */}
            <div className="px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
              <select
                aria-label="Header Level"
                className="text-sm rounded-md border border-slate-300 bg-white px-2 py-1"
                defaultValue="Header 3"
              >
                <option>Paragraph</option>
                <option>Header 1</option>
                <option>Header 2</option>
                <option>Header 3</option>
              </select>

              <div className="h-5 w-px bg-slate-300 mx-1" />

              <button className="p-1.5 rounded-md hover:bg-white" aria-label="Bold">
                <Icon d="M13.5 15H10v4H8V5h6a3.5 3.5 0 010 7 3 3 0 01-.5 6zM10 7v5h3a2.5 2.5 0 000-5h-3z" />
              </button>
              <button className="p-1.5 rounded-md hover:bg-white" aria-label="Italic">
                <Icon d="M10 4v2h2.21l-3.42 12H6v2h8v-2h-2.21l3.42-12H18V4z" />
              </button>
              <button className="p-1.5 rounded-md hover:bg-white" aria-label="Strike">
                <Icon d="M4 11h16v2H4v-2zm8-7c3.314 0 6 1.79 6 4h-3c0-.552-1.343-2-3-2s-3 .895-3 2c0 1.105.895 2 2 2h2c2.761 0 5 2.015 5 4.5S15.761 21 12 21s-6-1.79-6-4h3c0 1.105 1.343 2 3 2s3-.895 3-2c0-1.105-.895-2-2-2h-2C7.239 15 5 12.985 5 10.5 5 8.015 7.239 6 10 6h2z" />
              </button>

              <div className="ml-auto flex items-center gap-2">
                <button className="p-1.5 rounded-md hover:bg-white" aria-label="Bulleted list">
                  <Icon d="M4 7h3v2H4V7zm0 8h3v2H4v-2zM9 7h11v2H9V7zm0 8h11v2H9v-2z" />
                </button>
                <button className="p-1.5 rounded-md hover:bg-white" aria-label="Numbered list">
                  <Icon d="M4 6h2v2H4V6zm0 12h2v2H4v-2zM9 6h11v2H9V6zm0 12h11v2H9v-2z" />
                </button>
                <button className="p-1.5 rounded-md hover:bg-white" aria-label="Align left">
                  <Icon d="M4 6h16v2H4zM4 10h10v2H4zM4 14h16v2H4zM4 18h10v2H4z" />
                </button>
              </div>
            </div>

            {/* Editor content */}
            <div className="p-6 overflow-auto">
              <h3 className="text-xl font-semibold">Background</h3>
              <p className="mt-3 text-slate-700">
                You are an expert in Instructional Design.
              </p>
              <p className="mt-2 text-slate-700">
                Your role is to craft clear and measurable learning objectives.
              </p>
              <p className="mt-2 text-slate-700">You are talking to a teacher.</p>

              <h3 className="mt-8 text-xl font-semibold">Your Workflow</h3>

              <h4 className="mt-4 font-semibold">Step 1</h4>
              <p className="text-slate-700">
                First, greet the user and explain what your role is (creating learning
                objectives).
              </p>

              <h4 className="mt-4 font-semibold">Step 2</h4>
              <p className="text-slate-700">
                After they respond, ask for details about their objective (e.g., do they
                have an existing assignment or outcome in mind?). Gather additional
                detail (grade level, time for assignment, etc.).
              </p>

              <h4 className="mt-4 font-semibold">Step 3</h4>
              <p className="text-slate-700">
                Create clear and measurable learning objectives. Ensure they begin with
                an action verb using Bloom&apos;s Taxonomy learning verbs. Ask if the
                user would like to alter the objectives or get help with instructions or
                rubrics.
              </p>

              <h3 className="mt-8 text-xl font-semibold">Guidelines &amp; Guardrails</h3>
              <ol className="mt-3 list-decimal list-inside space-y-2 text-slate-700">
                <li>Avoid language that might seem judgmental or dismissive.</li>
                <li>
                  Be inclusive in examples and explanations; consider multiple
                  perspectives and avoid stereotypes.
                </li>
                <li>Provide clear and concise responses.</li>
              </ol>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
