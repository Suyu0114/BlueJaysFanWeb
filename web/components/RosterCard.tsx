import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import type { RosterPlayer } from "@/lib/players";

// One roster card: headshot, name, position · bats / throws, linking to the
// player page, on the hand-drawn scorecard frame (variant "card", which lifts
// on hover — it is a link). Shared by the roster grid (RosterExplorer) and the
// article figure PlayerCards, so the two never drift apart. `position` is
// whatever the caller resolved (current vs last Jays position).

export default function RosterCard({ player: p }: { player: RosterPlayer }) {
  const t = useTranslations("Roster");
  return (
    <ScorecardFrame seedKey={String(p.mlbam_id)} className="h-full">
      <Link href={`/players/${p.mlbam_id}`} className="relative z-10 block h-full p-4">
        {p.headshot_url && (
          <Image
            src={p.headshot_url}
            alt={p.name}
            width={120}
            height={120}
            unoptimized
            className="mx-auto h-auto max-w-full rounded-full bg-papaya ring-1 ring-navy/15 transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-105"
          />
        )}
        <div className="mt-3 text-center">
          <div className="font-medium text-navy">{p.name}</div>
          <div className="mt-1 text-xs text-navy/60">
            {p.position}
            {p.bats && p.throws && (
              <>
                {" · "}
                {t("bats")} {p.bats} / {t("throws")} {p.throws}
              </>
            )}
          </div>
        </div>
      </Link>
    </ScorecardFrame>
  );
}
