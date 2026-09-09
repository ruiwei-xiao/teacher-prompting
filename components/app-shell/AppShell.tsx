"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import TopNav from "@/components/app-shell/TopNav";
import WorkspaceSidebar from "@/components/app-shell/WorkspaceSidebar";
import { parseWorkspaceGetResponse } from "@/lib/workspace-ui/hub";
import { workspaceIdFromPath } from "@/lib/workspace-ui/nav";

type SidebarMenuContextValue = {
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
};

const SidebarMenuContext = createContext<SidebarMenuContextValue | null>(null);
const DRAWER_MS = 260;
const PIN_STORAGE_KEY = "tp-sidebar-pinned";
const RAIL_EXPANDED = "15rem";
const RAIL_COLLAPSED = "3.5rem";

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

function SidebarPinIcon({ expanded }: { expanded: boolean }) {
  const Icon = expanded ? ChevronLeft : ChevronRight;
  return <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * Full-width header, then a persistent left rail. Collapsed rail peeks labels
 * on hover; the pin control stays in the icon column. Overlay drawer on small
 * screens.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [pinned, setPinned] = useState(true);
  const [peeked, setPeeked] = useState(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);
  const toggleMenu = useCallback(() => setOpen((v) => !v), []);
  const expanded = pinned || peeked;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PIN_STORAGE_KEY) === "0") {
        setPinned(false);
      }
    } catch {
      // Keep the expanded default when storage is unavailable.
    }
  }, []);

  function togglePinned() {
    setPinned((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preference is best-effort.
      }
      if (next) setPeeked(false);
      return next;
    });
  }

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
      <div className="flex min-h-screen flex-col">
        <TopNav
          locationLabel={locationLabel}
          menuButton={
            <button
              ref={menuButtonRef}
              type="button"
              onClick={toggleMenu}
              className="pressable inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover-ok:bg-slate-100 md:hidden dark:text-zinc-300 dark:hover-ok:bg-zinc-800"
              aria-label={
                open ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={open}
              aria-controls="app-sidebar-drawer"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            className="relative hidden shrink-0 md:block"
            style={{ width: pinned ? RAIL_EXPANDED : RAIL_COLLAPSED }}
          >
            <aside
              className={`app-drawer-surface absolute inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 transition-[width,box-shadow] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none dark:border-zinc-800 ${
                peeked && !pinned ? "shadow-xl" : ""
              }`}
              style={{ width: expanded ? RAIL_EXPANDED : RAIL_COLLAPSED }}
              onMouseEnter={() => {
                if (!pinned) setPeeked(true);
              }}
              onMouseLeave={() => setPeeked(false)}
              aria-label="Library and workspaces"
            >
              <div className="flex h-12 shrink-0 items-center">
                <div className="flex w-[3.5rem] shrink-0 items-center justify-center">
                  <button
                    type="button"
                    onClick={togglePinned}
                    className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover-ok:bg-slate-100 dark:text-zinc-400 dark:hover-ok:bg-zinc-800"
                    aria-label={
                      pinned ? "Collapse sidebar" : "Keep sidebar open"
                    }
                    aria-pressed={pinned}
                    title={pinned ? "Collapse sidebar" : "Keep sidebar open"}
                  >
                    <SidebarPinIcon expanded={pinned} />
                  </button>
                </div>
              </div>
              <div
                className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 ${
                  expanded ? "px-2" : "px-1.5"
                }`}
              >
                <Suspense fallback={null}>
                  <WorkspaceSidebar
                    compact={!expanded}
                    onNavigate={() => setPeeked(false)}
                  />
                </Suspense>
              </div>
            </aside>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>

        {mounted && (
          <div className="fixed inset-0 z-[60] md:hidden">
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
              <div className="flex h-14 shrink-0 items-center justify-end px-3">
                <button
                  type="button"
                  onClick={closeMenu}
                  className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover-ok:bg-slate-100 dark:text-zinc-400 dark:hover-ok:bg-zinc-800"
                  aria-label="Close navigation"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
                <Suspense fallback={null}>
                  <WorkspaceSidebar onNavigate={closeMenu} />
                </Suspense>
              </div>
            </aside>
          </div>
        )}
      </div>
    </SidebarMenuContext.Provider>
  );
}
