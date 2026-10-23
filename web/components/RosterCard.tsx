import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import type { RosterPlayer } from "@/lib/players";

// One roster card: headshot, name, position · bats / throws, linking to the
// player page, on the hand-drawn scorecard frame (variant "card", which lifts
// on hover — it is a link). Shared by the roster grid (RosterExplorer) and the
// article figures PlayerCards / OtherClubPlayerCards, so they never drift apart.
// `position` is whatever the caller resolved (current vs last Jays position).
//
// Another club's player has no page here: `href` (an external URL) links out in
// a new tab instead, with a steel frame and an "MLB.com ↗" line so the card
// reads as a different kind of link; `club` (team code) goes before the position.

export default function RosterCard({ player: p, club, href }: { player: RosterPlayer; club?: string; href?: string }) {
  const t = useTranslations("Roster");
  const body = (
    <>
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
          {club && `${club} · `}
          {p.position}
          {p.bats && p.throws && (
            <>
              {" · "}
              {/* One piece: on a narrow card it moves to its own line instead of splitting "Throws / R". */}
              <span className="whitespace-nowrap">
                {t("bats")} {p.bats} / {t("throws")} {p.throws}
              </span>
            </>
          )}
        </div>
        {href && <div className="mt-1.5 text-[11px] text-navy/55">{t("mlbLink")}</div>}
      </div>
    </>
  );
  const cls = "relative z-10 block h-full p-4";
  return (
    <ScorecardFrame seedKey={String(p.mlbam_id)} ink={href ? "steel" : "navy"} className="h-full">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <Link href={`/players/${p.mlbam_id}`} className={cls}>
          {body}
        </Link>
      )}
    </ScorecardFrame>
  );
}
