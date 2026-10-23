import { Fragment } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import { teamAbbr } from "@/lib/team-abbr";

// The clubs an article is about (registry `teams`): cap logo + team code, "VS"
// between two. Shown over the article's title and on its card in the list; the
// share card draws the same row (lib/share-card). The codes are labels, so
// Graduate; the logos keep TeamLogo's hand-drawn wobble.

export default function ClubMatchup({ teams, size = 44, className }: { teams: number[]; size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      {teams.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && <span className="font-display text-xs uppercase tracking-wide text-navy/45">vs</span>}
          <span className="flex items-center gap-1.5">
            <TeamLogo teamId={id} teamName={teamAbbr(id)} size={size} />
            <span className="font-display text-sm uppercase tracking-wide text-navy">{teamAbbr(id)}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
