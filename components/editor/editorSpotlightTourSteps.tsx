import type { ReactNode } from "react";

export const EDITOR_SPOTLIGHT_STEP_COUNT = 11;

export const editorSpotlightTourStorageKey = (appId: string) =>
  `editorSpotlightTourV6:${appId}`;

export function editorSpotlightTourTitle(step: number): string {
  switch (step) {
    case 0:
      return "Final prompt — how the bot answers";
    case 1:
      return "Attachment (reference files)";
    case 2:
      return "Agent — teaching templates";
    case 3:
      return "Simulated learner chat";
    case 4:
      return "Case 1 — normal use";
    case 5:
      return "Case 2 — edge behavior";
    case 6:
      return "Chat panel — edit bubbles & update prompt";
    case 7:
      return "Apply current prompt — refresh previews";
    case 8:
      return "Add your own cases";
    case 9:
      return "Mark pass";
    case 10:
      return "Publish & share";
    default:
      return "";
  }
}

export function editorSpotlightTourBody(step: number): ReactNode {
  switch (step) {
    case 0:
      return (
        <>
          This is your <strong className="font-medium text-slate-800 dark:text-zinc-200">system prompt</strong>{" "}
          area: where you specify <strong className="font-medium text-slate-800 dark:text-zinc-200">how the bot should talk to students</strong>{" "}
          (role, steps, tone, and guardrails). When you create a new bot, it often starts from the{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">description you typed at setup</strong>—edit
          it here into a complete teaching prompt.
        </>
      );
    case 1:
      return (
        <>
          Use <strong className="font-medium text-slate-800 dark:text-zinc-200">Attachment</strong> to{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">attach reference files</strong>{" "}
          (PDFs, readings, rubrics, etc.). They are included as context so your prompt and previews stay aligned with your real materials.
        </>
      );
    case 2:
      return (
        <>
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Agent</strong> opens a{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">template gallery with a graphic UI</strong>:
          browse cards, read short descriptions, and insert a starter structure into the prompt instead of writing from zero.
        </>
      );
    case 3:
      return (
        <>
          This bright panel is an{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">AI-simulated conversation</strong> between a
          practice student and your bot—generated from your description and prompt so you can preview behavior, not real
          student data.
        </>
      );
    case 4:
      return (
        <>
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Case 1</strong> models a typical learner on
          the{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">expected path</strong>: they follow hints,
          ask reasonable questions, and use the bot the way you intend in a normal lesson.
        </>
      );
    case 5:
      return (
        <>
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Case 2</strong> is an{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">edge case</strong>—for example a student who{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">keeps asking for the final answer</strong>,
          pushes back, or holds a misconception. Use it to stress-test your prompt.
        </>
      );
    case 6:
      return (
        <>
          This whole <strong className="font-medium text-slate-800 dark:text-zinc-200">chat panel</strong> is where you
          refine turns: use <strong className="font-medium text-slate-800 dark:text-zinc-200">Edit bubble</strong> on a
          learner message to change what the simulated student said, then save and run{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Update prompt</strong> below the thread.
          That updates the <strong className="font-medium text-slate-800 dark:text-zinc-200">system prompt</strong> on
          the left to match your edited conversation. The next step shows{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Apply current prompt</strong> to refresh
          previews.
        </>
      );
    case 7:
      return (
        <>
          Click <strong className="font-medium text-slate-800 dark:text-zinc-200">Apply current prompt</strong> (this
          button) after your system prompt has changed—whether from manual edits or from bubble edits plus{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Update prompt</strong>. It refreshes the
          simulated testcase chats so you can verify the bot&apos;s updated behavior against the latest prompt.
        </>
      );
    case 8:
      return (
        <>
          Add a new test case by either{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">specifying a simulated student profile</strong>{" "}
          (with scenario), or{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">starting a fresh conversation</strong> with
          the bot from scratch. Use{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">New case → Add test case</strong>.
        </>
      );
    case 9:
      return (
        <>
          When a test chat looks good, press{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Mark pass</strong>. Press again to{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">toggle off</strong> if you change your mind.
        </>
      );
    case 10:
      return (
        <>
          <strong className="font-medium text-slate-800 dark:text-zinc-200">Publish</strong> only works when{" "}
          <strong className="font-medium text-slate-800 dark:text-zinc-200">every</strong> test case is marked pass.
          <strong className="font-medium text-slate-800 dark:text-zinc-200"> Share</strong> stays disabled until the bot
          is published; after publishing you can copy share links.
        </>
      );
    default:
      return null;
  }
}
