"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { useDetailsMenu } from "@/lib/use-details-menu";
import { TeamLinks, type TeamSpan } from "./TeamMenu";

// Phone header (below md): ☰ drops a full-width papaya panel under the header
// with every nav link; Team's links sit inline (no second menu to open). A
// native <details> like TeamMenu, so it opens and closes without JS. The
// <details> must stay unpositioned: the panel spans the (relative) header.

export default function MobileMenu({
  seasons,
  trendSpan,
  className = "",
}: {
  seasons: number[];
  trendSpan: TeamSpan;
  className?: string;
}) {
  const t = useTranslations("Nav");
  const { ref, open, setOpen, close, pathname } = useDetailsMenu();
  // Exact page = "page"; anywhere below a section (/players/123) = "true".
  const current = (href: string) =>
    pathname === href ? "page" : href !== "/" && pathname.startsWith(`${href}/`) ? "true" : undefined;

  return (
    <details
      ref={ref}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`group ${className}`}
    >
      <summary
        aria-label={t("menu")}
        className="-mr-2 grid size-10 cursor-pointer list-none place-items-center rounded-md transition-colors hover:text-steel [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path className="group-open:hidden" d="M4 7h16M4 12h16M4 17h16" />
          <path className="hidden group-open:block" d="M6 6l12 12M18 6 6 18" />
        </svg>
      </summary>
      {/* Behind the header's own content (negative z in its z-40 stacking
          context) but over the page: dims it and swallows the closing tap. */}
      <div aria-hidden onClick={close} className="fade-in fixed inset-0 -z-10 bg-navy/30" />
      <nav
        aria-label={t("menu")}
        className="drop-in absolute inset-x-0 top-[calc(100%+2px)] border-b-2 border-brick bg-papaya text-navy shadow-[0_6px_18px_rgba(0,48,73,0.18)]"
      >
        <ul className="mx-auto max-w-5xl px-4 py-1">
          {NAV_ITEMS.map((item) =>
            item.href == null ? (
              <li key={item.key} className="border-b border-navy/10 py-3">
                <div className="font-display text-xs uppercase tracking-wider text-navy/55">{t(item.key)}</div>
                <div className="mt-2 border-l-2 border-navy/15 pl-3">
                  <TeamLinks seasons={seasons} trendSpan={trendSpan} onNavigate={close} touch />
                </div>
              </li>
            ) : (
              <li key={item.key} className="border-b border-navy/10 last:border-0">
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={current(item.href)}
                  className="-ml-3 flex min-h-11 items-center border-l-2 border-transparent pl-3 text-base transition-colors hover:text-brick aria-[current]:border-brick aria-[current]:text-brick"
                >
                  {t(item.key)}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </details>
  );
}
