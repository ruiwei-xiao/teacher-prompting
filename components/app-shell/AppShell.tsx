"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";

type SidebarMenuContextValue = {
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
};

const SidebarMenuContext = createContext<SidebarMenuContextValue | null>(null);

export function useSidebarMenu(): SidebarMenuContextValue {
  const ctx = useContext(SidebarMenuContext);
  if (!ctx) {
    throw new Error("useSidebarMenu must be used within AppShell");
  }
  return ctx;
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M2 5.75A.75.75 0 012.75 5h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 5.75zm0 4.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 4.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

/**
 * App chrome: TopNav hamburger opens Library / Workspaces as a left drawer.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);
  const toggleMenu = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <SidebarMenuContext.Provider
      value={{ open, openMenu, closeMenu, toggleMenu }}
    >
      <div className="min-h-screen flex flex-col">
        <TopNav
          menuButton={
            <button
              type="button"
              onClick={toggleMenu}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label={open ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={open}
              aria-controls="app-sidebar-drawer"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          }
        />

        {open && (
          <div className="fixed inset-0 z-40">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/40"
              aria-label="Close navigation overlay"
              onClick={closeMenu}
            />
            <aside
              id="app-sidebar-drawer"
              className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
              role="dialog"
              aria-modal="true"
              aria-label="Library and workspaces"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-zinc-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  aria-label="Close navigation"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <WorkspaceSidebar onNavigate={closeMenu} />
              </div>
            </aside>
          </div>
        )}

        {children}
      </div>
    </SidebarMenuContext.Provider>
  );
}
