import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SlidingPill from "./motion/SlidingPill";

// The team section's two views as tabs, mirroring PlayerNav: one season's
// review (/season/[year], P12) and the five-season trends (/team, P13). The
// header's "Team ▾" menu reaches the same two; these keep the switch one tap
// away on the page itself.

export type TeamSection = "season" | "trends";

export default async function TeamNav({
  active,
  season,
}: {
  active: TeamSection;
  season: number; // the season tab's target: the page's own season, or the newest
}) {
  const t = await getTranslations("Nav");
  const items: { key: TeamSection; label: string; href: string }[] = [
    { key: "season", label: t("seasonReview"), href: `/season/${season}` },
    { key: "trends", label: t("trends"), href: "/team" },
  ];

  return (
    <nav aria-label={t("teamMenuLabel")} className="mb-6 flex gap-1 border-b border-navy/15 text-sm">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative -mb-px border-b-2 border-transparent px-3 py-1.5 font-medium transition-colors ${
              isActive ? "text-navy" : "text-navy/55 hover:text-navy"
            }`}
          >
            {isActive && (
              <SlidingPill group="team-nav-underline" className="inset-x-0 -bottom-0.5 h-0.5 bg-brick" />
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
