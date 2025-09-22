"use client";
import { useState } from "react";
import EditorChrome from "@/components/editor/EditorChrome";
import LeftChat from "@/components/editor/LeftChat";
import EditorToolbar from "@/components/editor/EditorToolbar";
import InstructionDoc from "@/components/editor/InstructionDoc";
import RightRail from "@/components/editor/RightRail";
import AssistantPanel from "@/components/editor/AssistantPanel";

export default function EditorPage({ params }: { params: { appId: string } }) {
  const [assistantOpen, setAssistantOpen] = useState(true);

  const gridCols = assistantOpen
    ? "grid-cols-1 xl:grid-cols-[1.05fr_1.6fr_1.05fr_minmax(232px,0.7fr)]"
    : "grid-cols-1 xl:grid-cols-[1.05fr_1.7fr_minmax(232px,0.7fr)]";

  return (
    <EditorChrome appName={params.appId}>
      {/* ⬇️ No outer border/rounded/shadow; only internal dividers */}
      <div className={`h-full grid ${gridCols} gap-0 divide-x divide-slate-200`}>
        <div className="h-full bg-white">
          <LeftChat />
        </div>

        <section className="h-full bg-white flex flex-col">
          <EditorToolbar />
          <div className="min-h-0 flex-1">
            <InstructionDoc />
          </div>
        </section>

        {assistantOpen && (
          <div className="h-full bg-white">
            <AssistantPanel />
          </div>
        )}

        <div className="h-full bg-white">
          <RightRail
            assistantOpen={assistantOpen}
            onToggleAssistant={() => setAssistantOpen((v) => !v)}
          />
        </div>
      </div>
    </EditorChrome>
  );
}
