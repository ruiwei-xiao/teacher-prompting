import { ReactNode } from "react";

type Step = { title: string; body: ReactNode };

const steps: Step[] = [
  {
    title: "Building apps in Playlab",
    body: (
      <>
        Welcome to the editor, where you build, test, and iterate on your app! Write your
        instructions on the right. On the left, preview and test as you build.
        <div className="mt-3 text-sky-700 bg-sky-50 border border-sky-200 rounded-lg p-3">
          <strong className="mr-1">Pro-tip:</strong> Any edits you make will be reflected in your app preview.
        </div>
      </>
    ),
  },
  {
    title: "Add references",
    body: (
      <>
        Add reference materials through the toolbar. Upload files or add public links, and enable/disable as needed.
        <div className="mt-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <strong>Please Note:</strong> Avoid PII or sensitive info, especially in public apps.
        </div>
      </>
    ),
  },
  {
    title: "Ask our assistant",
    body: (
      <>
        The Playlab assistant can help brainstorm ideas, refine instructions, or troubleshoot. Think of it as a collaborator.
      </>
    ),
  },
  {
    title: "Settings",
    body: (
      <>
        Edit the welcome message users see when they open your app. Add Starter Inputs to collect info before they hit “Start”.
      </>
    ),
  },
];

export default steps;
