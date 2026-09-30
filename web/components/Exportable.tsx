"use client";

// P12 M7: wrap any chart to give it a small "PNG" download button (top-right).
// Generic: it exports the largest <svg> inside it via lib/export-svg.ts, so the
// same wrapper serves D3 charts, Recharts charts and server-rendered SVGs alike.
// Hidden when printing.

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { exportSvgAsPng, largestSvg, slugify } from "@/lib/export-svg";

export default function Exportable({
  name,
  caption,
  className = "",
  children,
}: {
  name: string; // file name base, slugified: "vladimir-guerrero-jr-spray-2026"
  caption?: string; // footer line inside the PNG
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Export");
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  const onClick = async () => {
    const svg = ref.current ? largestSvg(ref.current) : null;
    if (!svg) return;
    setState("busy");
    try {
      await exportSvgAsPng(svg, { filename: slugify(name) || "chart", caption });
      setState("idle");
    } catch {
      setState("failed");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}
      <button
        type="button"
        onClick={onClick}
        disabled={state === "busy"}
        title={t("pngTitle")}
        aria-label={t("pngTitle")}
        className="absolute right-1 top-1 z-20 rounded border border-navy/15 bg-papaya/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-navy/60 transition-colors hover:border-navy/40 hover:text-navy disabled:opacity-50 print:hidden"
      >
        {state === "failed" ? t("failed") : "PNG ↓"}
      </button>
    </div>
  );
}
