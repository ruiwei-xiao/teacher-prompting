"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type SpotlightHoleRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const HOLE_PAD = 12;
const HOLE_RX = 26;
const CARD_MAX_W = 384;
const VIEW_MARGIN = 16;
const CARD_GAP = 18;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function placeCardNearHole(
  hole: { top: number; left: number; right: number; bottom: number },
  cardW: number,
  cardH: number,
  vw: number,
  vh: number
): { top: number; left: number } {
  const m = VIEW_MARGIN;
  const holeCx = (hole.left + hole.right) / 2;
  const holeCy = (hole.top + hole.bottom) / 2;

  const fitsBelow = hole.bottom + CARD_GAP + cardH <= vh - m;
  if (fitsBelow) {
    const top = hole.bottom + CARD_GAP;
    const left = clamp(holeCx - cardW / 2, m, vw - m - cardW);
    return { top, left };
  }

  const fitsAbove = hole.top - CARD_GAP - cardH >= m;
  if (fitsAbove) {
    const top = hole.top - CARD_GAP - cardH;
    const left = clamp(holeCx - cardW / 2, m, vw - m - cardW);
    return { top, left };
  }

  const fitsRight = hole.right + CARD_GAP + cardW <= vw - m;
  if (fitsRight) {
    const left = hole.right + CARD_GAP;
    const top = clamp(holeCy - cardH / 2, m, vh - m - cardH);
    return { top, left };
  }

  const fitsLeft = hole.left - CARD_GAP - cardW >= m;
  if (fitsLeft) {
    const left = hole.left - CARD_GAP - cardW;
    const top = clamp(holeCy - cardH / 2, m, vh - m - cardH);
    return { top, left };
  }

  const top = clamp(hole.bottom + CARD_GAP, m, vh - m - cardH);
  const left = clamp(holeCx - cardW / 2, m, vw - m - cardW);
  return { top, left };
}

/**
 * Full-viewport dim with a soft-edged rounded “hole” over a measured rect + copy + Next / Done.
 */
export default function EditorTestcaseSpotlight({
  show,
  holeRect,
  title,
  body,
  stepIndex,
  stepCount,
  primaryLabel,
  onPrimary,
}: {
  show: boolean;
  holeRect: SpotlightHoleRect | null;
  title: string;
  body: ReactNode;
  stepIndex: number;
  stepCount: number;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 320, height: 220 });
  const reactId = useId();
  const svgSuffix = reactId.replace(/:/g, "");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  const holeSig = holeRect
    ? `${Math.round(holeRect.top)}_${Math.round(holeRect.left)}_${Math.round(holeRect.width)}_${Math.round(holeRect.height)}`
    : "";

  useLayoutEffect(() => {
    if (!show || !cardRef.current) return;
    const el = cardRef.current;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setCardSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [show, holeSig, stepIndex, stepCount, primaryLabel]);

  const layout = useMemo(() => {
    if (!holeRect || typeof window === "undefined") return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const t = Math.max(0, holeRect.top - HOLE_PAD);
    const l = Math.max(0, holeRect.left - HOLE_PAD);
    const r = l + holeRect.width + HOLE_PAD * 2;
    const b = t + holeRect.height + HOLE_PAD * 2;
    const cardW = Math.min(CARD_MAX_W, vw - VIEW_MARGIN * 2);
    const pos = placeCardNearHole(
      { top: t, left: l, right: r, bottom: b },
      cardW,
      cardSize.height,
      vw,
      vh
    );
    return { t, l, r, b, vw, vh, cardW, cardLeft: pos.left, cardTop: pos.top };
  }, [holeSig, cardSize.height]);

  if (!mounted || !show || !holeRect || !layout || typeof window === "undefined") return null;

  const { t, l, r, b, vw, vh, cardW, cardLeft, cardTop } = layout;
  const holeW = r - l;
  const holeH = b - t;

  const maskId = `spotlight-mask-${svgSuffix}`;
  const blurFilterId = `spotlight-hole-soft-${svgSuffix}`;
  const titleId = `testcase-spotlight-title-${stepIndex}`;
  const descId = `testcase-spotlight-desc-${stepIndex}`;

  const node = (
    <div
      className="pointer-events-auto fixed inset-0 z-40"
      aria-modal="true"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Dim + soft hole via SVG mask (blurred cutout = feathered edge) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        width={vw}
        height={vh}
        aria-hidden
      >
        <defs>
          <filter
            id={blurFilterId}
            x="-80"
            y="-80"
            width={vw + 160}
            height={vh + 160}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
          </filter>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={vw} height={vh}>
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            <rect
              x={l}
              y={t}
              width={holeW}
              height={holeH}
              rx={HOLE_RX}
              ry={HOLE_RX}
              fill="black"
              filter={`url(#${blurFilterId})`}
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={vw}
          height={vh}
          mask={`url(#${maskId})`}
          className="fill-slate-950/[0.72] dark:fill-black/[0.78]"
        />
      </svg>

      {/* Glow ring + soft outer bloom */}
      <div
        className="pointer-events-none absolute border-2 border-sky-400/90 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_0_32px_12px_rgba(56,189,248,0.22),0_0_64px_24px_rgba(14,165,233,0.12)] dark:border-sky-300/90 dark:shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_0_36px_14px_rgba(125,211,252,0.18),0_0_72px_28px_rgba(14,165,233,0.1)]"
        style={{ top: t, left: l, width: holeW, height: holeH, borderRadius: HOLE_RX }}
      />

      <div
        ref={cardRef}
        className="pointer-events-none fixed z-[41] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-white/25 bg-white/96 p-4 text-slate-800 shadow-[0_8px_40px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-500/40 dark:bg-zinc-900/96 dark:text-zinc-100 dark:shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
        style={{
          width: cardW,
          left: cardLeft,
          top: cardTop,
          maxHeight: `min(70vh, calc(100vh - ${VIEW_MARGIN * 2}px))`,
        }}
      >
        <p className="text-center text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          Step {stepIndex + 1} of {stepCount}
        </p>
        <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-zinc-50">
          {title}
        </h2>
        <div
          id={descId}
          className="max-h-[min(40vh,260px)] overflow-y-auto text-sm leading-relaxed text-slate-600 dark:text-zinc-300"
        >
          {body}
        </div>
        <button
          type="button"
          onClick={onPrimary}
          className="pointer-events-auto mt-1 w-full shrink-0 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
