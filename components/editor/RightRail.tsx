"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  label: string;
  hint: string;
  top: number;
  left: number;
} | null;

function Icon({
  d,
  className = "h-5 w-5",
}: {
  d: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function RailButton({
  label,
  hint,
  icon,
  active = false,
  describedBy,
  onClick,
  onShowTooltip,
  onHideTooltip,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  active?: boolean;
  describedBy?: string;
  onClick?: () => void;
  onShowTooltip: (el: HTMLElement, label: string, hint: string) => void;
  onHideTooltip: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}. ${hint}`}
      aria-pressed={active}
      aria-describedby={describedBy}
      onMouseEnter={(e) => onShowTooltip(e.currentTarget, label, hint)}
      onMouseLeave={onHideTooltip}
      onFocus={(e) => onShowTooltip(e.currentTarget, label, hint)}
      onBlur={onHideTooltip}
      className={[
        "flex h-11 w-11 items-center justify-center rounded-xl",
        "transition-[background-color,color,transform] duration-150 ease-out",
        "active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35",
        active
          ? "bg-sky-600 text-white dark:bg-sky-500"
          : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/90 hover:bg-slate-50 hover:text-slate-900 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

export default function RightRail({
  assistantOpen,
  settingsOpen,
  showSettings = true,
  onToggleAssistant,
  onOpenSettings,
}: {
  assistantOpen: boolean;
  settingsOpen: boolean;
  showSettings?: boolean;
  onToggleAssistant: () => void;
  onOpenSettings: () => void;
}) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showTooltip = (el: HTMLElement, label: string, hint: string) => {
    const rect = el.getBoundingClientRect();
    setTooltip({
      label,
      hint,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <aside className="flex h-full flex-col items-center bg-slate-50 px-1.5 py-4 dark:bg-zinc-950">
      <div className="flex flex-col gap-1.5">
        <RailButton
          active={assistantOpen}
          onClick={onToggleAssistant}
          label="Assistant"
          hint={assistantOpen ? "Hide left panel" : "Show left panel"}
          describedBy={tooltip?.label === "Assistant" ? tooltipId : undefined}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
          icon={
            <Icon d="M12 2a2 2 0 00-2 2v1H8a3 3 0 00-3 3v6a3 3 0 003 3h2v1a2 2 0 104 0v-1h2a3 3 0 003-3V8a3 3 0 00-3-3h-2V4a2 2 0 00-2-2zm-2 7a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm4 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-5 7h6v-1.5H9V16z" />
          }
        />
        {showSettings && (
          <RailButton
            active={settingsOpen}
            onClick={onOpenSettings}
            label="Settings"
            hint="Model, API key, assisted mode"
            describedBy={tooltip?.label === "Settings" ? tooltipId : undefined}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
            icon={
              <Icon d="M19.14 12.94a7.48 7.48 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.6 7.6 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.48 7.48 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.51.4 1.05.71 1.63.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
            }
          />
        )}
      </div>

      {mounted &&
        tooltip &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[80] -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-left whitespace-nowrap shadow-md dark:bg-zinc-100"
            style={{ top: tooltip.top, left: tooltip.left }}
          >
            <div className="text-xs font-medium text-white dark:text-zinc-900">
              {tooltip.label}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-300 dark:text-zinc-500">
              {tooltip.hint}
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
}
