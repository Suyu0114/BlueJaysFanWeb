"use client";

// P12 M7: "Copy table" — puts any table on the clipboard as TSV (pastes into a
// spreadsheet or doc as a real table). Generic: plain headers + rows in; the
// server component that owns the table builds them from its display strings.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { copyText, toTsv, type Cell } from "@/lib/copy-table";

export default function CopyTableButton({
  headers,
  rows,
  className = "",
}: {
  headers: Cell[];
  rows: Cell[][];
  className?: string;
}) {
  const t = useTranslations("Export");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const onClick = async () => {
    const ok = await copyText(toTsv(headers, rows));
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1600);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={t("copyTitle")}
      className={`shrink-0 rounded border border-navy/15 bg-papaya/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-navy/60 transition-colors hover:border-navy/40 hover:text-navy print:hidden ${className}`}
    >
      <span aria-live="polite">
        {state === "copied" ? t("copied") : state === "failed" ? t("failed") : t("copy")}
      </span>
    </button>
  );
}
