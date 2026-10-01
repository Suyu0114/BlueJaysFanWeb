"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

// "Team ▾" in the header: the team section has two views — one season's review
// (/season/[year], P12) and the five-season trends (/team, P13). A native
// <details> disclosure, so it opens and closes without JS; with JS it also
// closes on Escape, an outside click and navigation. Click / tap only — no
// hover-open, which misfires on touch and on the two-row phone header.

export default function TeamMenu({
  seasons,
  trendSpan,
  linkClass,
}: {
  seasons: number[]; // newest first (seasons with final regular-season games)
  trendSpan: { from: number; to: number } | null;
  linkClass: string; // the header's NAV_LINK, so the summary matches its siblings
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  // Remember the path it was opened on: navigating anywhere else closes it
  // (the header persists across client navigations) without a sync effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      ref.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const [latest, ...earlier] = seasons;
  const current = (href: string) => (pathname === href ? "page" : undefined);
  const close = () => setOpen(false); // a link to the page we're already on doesn't change pathname

  return (
    <details
      ref={ref}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      // Phones: the panel spans the (relative) header below its wrapped rows;
      // from sm up it hangs off the summary's right edge.
      className="group sm:relative"
    >
      <summary className={`${linkClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {t("team")}
        <span
          aria-hidden
          className="ml-1 inline-block text-[10px] transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <nav
        aria-label={t("teamMenuLabel")}
        className="fade-in absolute inset-x-4 top-full z-50 mt-1 rounded-md sm:inset-x-auto sm:right-0 sm:mt-2 sm:w-60 border border-navy/20 bg-papaya p-3 text-navy shadow-[0_6px_18px_rgba(0,48,73,0.18)]"
      >
        {latest != null && (
          <>
            <div className="font-display text-[11px] uppercase tracking-wider text-navy/55">{t("seasonReview")}</div>
            <Link
              href={`/season/${latest}`}
              onClick={close}
              aria-current={current(`/season/${latest}`)}
              className="mt-1 block text-base transition-colors hover:text-brick aria-[current=page]:text-brick"
            >
              {t("seasonLink", { season: latest })}
            </Link>
            {earlier.length > 0 && (
              <div className="mt-1.5">
                <div className="text-[11px] text-navy/50">{t("pastSeasons")}</div>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {earlier.map((s) => (
                    <li key={s}>
                      <Link
                        href={`/season/${s}`}
                        onClick={close}
                        aria-current={current(`/season/${s}`)}
                        className="block rounded border border-navy/15 px-1.5 py-0.5 text-xs tabular-nums transition-colors hover:border-brick hover:text-brick aria-[current=page]:border-brick aria-[current=page]:text-brick"
                      >
                        {s}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <hr className="my-3 border-navy/15" />
          </>
        )}
        <Link
          href="/team"
          onClick={close}
          aria-current={current("/team")}
          className="block transition-colors hover:text-brick aria-[current=page]:text-brick"
        >
          <span className="block text-base">{t("trends")}</span>
          {trendSpan && (
            <span className="block text-[11px] text-navy/55">
              {t("trendsHint", { from: trendSpan.from, to: trendSpan.to })}
            </span>
          )}
        </Link>
      </nav>
    </details>
  );
}
