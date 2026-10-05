"use client";

// A table's export actions, side by side: "PNG ↓" (a branded image of the
// table, for posts; lib/export-table.ts) and "Copy table" (TSV that pastes into
// a spreadsheet or doc as a real table, ending with the site's source line).
// Generic: plain headers + rows in; the component that owns the table builds
// them from its display strings.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { copyText, toTsv, type Cell } from "@/lib/copy-table";
import { exportTableAsPng } from "@/lib/export-table";
import { slugify } from "@/lib/export-svg";
import { sourceLine } from "@/lib/site";

const BUTTON =
  "rounded border border-navy/15 bg-papaya/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-navy/60 transition-colors hover:border-navy/40 hover:text-navy disabled:opacity-50";

export default function TableExport({
  headers,
  rows,
  name,
  caption,
  className = "",
}: {
  headers: Cell[];
  rows: Cell[][];
  name: string; // file name base, slugified: "2026-blue-jays-player-stats"
  caption?: string; // footer line inside the PNG
  className?: string;
}) {
  const t = useTranslations("Export");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [png, setPng] = useState<"idle" | "busy" | "failed">("idle");

  const onCopy = async () => {
    const ok = await copyText(toTsv(headers, rows, sourceLine()));
    setCopy(ok ? "copied" : "failed");
    setTimeout(() => setCopy("idle"), 1600);
  };

  const onPng = async () => {
    setPng("busy");
    try {
      await exportTableAsPng(headers, rows, { filename: slugify(name) || "table", caption });
      setPng("idle");
    } catch {
      setPng("failed");
      setTimeout(() => setPng("idle"), 2000);
    }
  };

  return (
    <div className={`flex shrink-0 items-center gap-1 print:hidden ${className}`}>
      <button
        type="button"
        onClick={onPng}
        disabled={png === "busy"}
        title={t("tablePngTitle")}
        aria-label={t("tablePngTitle")}
        className={BUTTON}
      >
        {png === "failed" ? t("failed") : "PNG ↓"}
      </button>
      <button type="button" onClick={onCopy} title={t("copyTitle")} className={BUTTON}>
        <span aria-live="polite">
          {copy === "copied" ? t("copied") : copy === "failed" ? t("failed") : t("copy")}
        </span>
      </button>
    </div>
  );
}
