import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SlidingPill from "./motion/SlidingPill";
import type { PlayerAvailability } from "@/lib/players";

export type PlayerSection = "overview" | "batting" | "pitching" | "fielding" | "bazi";

const DEFAULT_AVAILABILITY: PlayerAvailability = {
  batting: true,
  pitching: true,
  fielding: true,
  bazi: false,
};

export default async function PlayerNav({
  mlbamId,
  active,
  available = DEFAULT_AVAILABILITY,
}: {
  mlbamId: number;
  active: PlayerSection;
  available?: PlayerAvailability;
}) {
  const t = await getTranslations("PlayerNav");

  const items: { key: PlayerSection; label: string; href: string; show: boolean }[] = [
    { key: "overview", label: t("overview"), href: `/players/${mlbamId}`, show: true },
    { key: "batting", label: t("batting"), href: `/players/${mlbamId}/batting`, show: available.batting },
    { key: "pitching", label: t("pitching"), href: `/players/${mlbamId}/pitching`, show: available.pitching },
    { key: "fielding", label: t("fielding"), href: `/players/${mlbamId}/fielding`, show: available.fielding },
    // v2 BaZi: slot reserved. P6 always hides this; v2 flips available.bazi to true.
    { key: "bazi", label: t("bazi"), href: `/players/${mlbamId}/bazi`, show: available.bazi },
  ];

  return (
    <nav className="mb-4 flex gap-1 border-b border-navy/15 text-sm">
      {items.filter((i) => i.show).map((item) => {
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
            {/* The brick underline is a shared-layout element: moving between
                sub-pages slides it from the old tab to the new one. */}
            {isActive && (
              <SlidingPill
                group="player-nav-underline"
                className="inset-x-0 -bottom-0.5 h-0.5 bg-brick"
              />
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
