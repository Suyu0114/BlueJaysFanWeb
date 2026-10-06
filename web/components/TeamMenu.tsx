"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useDetailsMenu } from "@/lib/use-details-menu";

// "Team ▾" in the header: the team section has two views — one season's review
// (/season/[year], P12) and the five-season trends (/team, P13). A native
// <details> disclosure (useDetailsMenu), so it opens and closes without JS.
// Click / tap only — no hover-open, which misfires on touch. Desktop only (md+);
// on phones MobileMenu lists the same TeamLinks inline.

export type TeamSpan = { from: number; to: number } | null;

export function TeamLinks({
  seasons,
  trendSpan,
  onNavigate,
  touch = false,
}: {
  seasons: number[]; // newest first (seasons with final regular-season games)
  trendSpan: TeamSpan;
  onNavigate: () => void;
  touch?: boolean; // phone menu: finger-sized season chips
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [latest, ...earlier] = seasons;
  const current = (href: string) => (pathname === href ? "page" : undefined);
  const chip = touch ? "px-3 py-1.5 text-sm" : "px-1.5 py-0.5 text-xs";

  return (
    <>
      {latest != null && (
        <>
          <div className="font-display text-[11px] uppercase tracking-wider text-navy/55">{t("seasonReview")}</div>
          <Link
            href={`/season/${latest}`}
            onClick={onNavigate}
            aria-current={current(`/season/${latest}`)}
            className="mt-1 block text-base transition-colors hover:text-brick aria-[current=page]:text-brick"
          >
            {t("seasonLink", { season: latest })}
          </Link>
          {earlier.length > 0 && (
            <div className="mt-1.5">
              <div className="text-[11px] text-navy/50">{t("pastSeasons")}</div>
              <ul className={`mt-1 flex flex-wrap ${touch ? "gap-2" : "gap-1"}`}>
                {earlier.map((s) => (
                  <li key={s}>
                    <Link
                      href={`/season/${s}`}
                      onClick={onNavigate}
                      aria-current={current(`/season/${s}`)}
                      className={`block rounded border border-navy/15 ${chip} tabular-nums transition-colors hover:border-brick hover:text-brick aria-[current=page]:border-brick aria-[current=page]:text-brick`}
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
        onClick={onNavigate}
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
    </>
  );
}

export default function TeamMenu({
  seasons,
  trendSpan,
  linkClass,
}: {
  seasons: number[];
  trendSpan: TeamSpan;
  linkClass: string; // the header's NAV_LINK, so the summary matches its siblings
}) {
  const t = useTranslations("Nav");
  const { ref, open, setOpen, close } = useDetailsMenu();

  return (
    <details
      ref={ref}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group relative"
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
        className="fade-in absolute right-0 top-full z-50 mt-2 w-60 rounded-md border border-navy/20 bg-papaya p-3 text-navy shadow-[0_6px_18px_rgba(0,48,73,0.18)]"
      >
        <TeamLinks seasons={seasons} trendSpan={trendSpan} onNavigate={close} />
      </nav>
    </details>
  );
}
