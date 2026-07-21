"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";

type SidebarMenuContextValue = {
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
};

const SidebarMenuContext = createContext<SidebarMenuContextValue | null>(null);
const DRAWER_MS = 260;

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

function workspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspace\/([^/]+)/);
  if (!match) return null;
  if (pathname.startsWith("/workspace/invite/")) return null;
  return match[1] || null;
}

/**
 * App chrome: TopNav hamburger opens Library / Workspaces as a left drawer.
 * PC-oriented: focus trap, Esc, inert background, wayfinding label.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);
  const toggleMenu = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const workspaceId = workspaceIdFromPath(pathname);
    if (!workspaceId) {
      setLocationLabel(null);
      return;
    }

    let cancelled = false;
    async function loadName() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseWorkspaceGetResponse(res.status, body);
        if (parsed.ok) {
          setLocationLabel(parsed.workspace.name);
        } else {
          setLocationLabel(null);
        }
      } catch {
        if (!cancelled) setLocationLabel(null);
      }
    }

    void loadName();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      wasOpenRef.current = true;
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setVisible(true));
      });
      return () => window.cancelAnimationFrame(id);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => {
      setMounted(false);
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        menuButtonRef.current?.focus();
      }
    }, DRAWER_MS);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!visible || !mounted) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(drawer.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
      );

    const initial = focusables()[0];
    initial?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    drawer.addEventListener("keydown", onKeyDown);
    return () => drawer.removeEventListener("keydown", onKeyDown);
  }, [visible, mounted]);

  return (
    <SidebarMenuContext.Provider
      value={{ open, openMenu, closeMenu, toggleMenu }}
    >
      <div className="min-h-screen flex flex-col">
        <div
          className="flex min-h-0 flex-1 flex-col"
          inert={open || undefined}
          aria-hidden={open || undefined}
        >
          <TopNav
            locationLabel={locationLabel}
            menuButton={
              <button
                ref={menuButtonRef}
                type="button"
                onClick={toggleMenu}
                className="pressable inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover-ok:bg-slate-100 dark:text-zinc-300 dark:hover-ok:bg-zinc-800"
                aria-label={open ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={open}
                aria-controls="app-sidebar-drawer"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            }
          />
          {children}
        </div>

        {mounted && (
          /* Above app-chrome (z-50) so glass header never composites drawer text. */
          <div className="fixed inset-0 z-[60]">
            <button
              type="button"
              className="drawer-backdrop absolute inset-0 bg-slate-900/40"
              data-open={visible ? "true" : "false"}
              aria-label="Close navigation overlay"
              onClick={closeMenu}
              tabIndex={-1}
            />
            <aside
              ref={drawerRef}
              id="app-sidebar-drawer"
              className="app-drawer-surface drawer-panel absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-slate-200 shadow-xl dark:border-zinc-800"
              data-open={visible ? "true" : "false"}
              role="dialog"
              aria-modal="true"
              aria-label="Library and workspaces"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-4 dark:border-zinc-800">
                <span className="type-title text-sm text-slate-900 dark:text-zinc-100">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover-ok:bg-slate-100 dark:text-zinc-400 dark:hover-ok:bg-zinc-800"
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
      </div>
    </SidebarMenuContext.Provider>
  );
}
