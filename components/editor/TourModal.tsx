"use client";

import { useState } from "react";

type Step = { title: string; body: React.ReactNode };

export default function TourModal({ steps, onDone }: { steps: Step[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const back = () => setI((v) => Math.max(0, v - 1));
  const next = () => (i === steps.length - 1 ? onDone() : setI((v) => Math.min(steps.length - 1, v + 1)));

  return (
    <div className="relative">
      <div className="relative mx-auto bg-white rounded-2xl shadow-2xl border max-w-5xl">
        <div className="p-6 md:p-8 grid md:grid-cols-2 gap-6 items-stretch">
          <div className="rounded-xl border bg-slate-50 p-4 overflow-hidden">
            <div className="h-80 md:h-full overflow-auto">
              <div className="text-sm text-slate-500 mb-2">Preview</div>
              <div className="rounded-lg bg-white border p-4">
                <div className="text-slate-700 text-sm leading-6">
                  <strong className="block mb-2">Background</strong>
                  You are an expert in prompt engineering, cybersecurity, and using AI in an educational context…
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-500">Chat</div>
              <div className="rounded-lg bg-white border p-4">
                <div className="text-slate-700 text-sm">Hi! Ready to build your app?</div>
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 h-9 rounded border px-2" placeholder="Enter Message" />
                  <button className="h-9 px-3 rounded bg-sky-600 text-white">Send</button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <h2 className="text-xl font-semibold">{step.title}</h2>
            <div className="mt-3 text-slate-700">{step.body}</div>
            <div className="mt-6 flex items-center gap-2">
              {steps.map((_, idx) => (
                <span key={idx} className={`h-2 w-2 rounded-full ${idx === i ? "bg-sky-600" : "bg-slate-300"}`} />
              ))}
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={back} className="px-3 h-9 rounded-lg border border-slate-300 hover:bg-slate-50">Back</button>
              <button onClick={next} className="px-4 h-9 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                {i === steps.length - 1 ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
