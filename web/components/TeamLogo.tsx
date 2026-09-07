import { hasTeamLogo, teamAbbr } from "@/lib/team-abbr";

// P11: the club cap mark, recoloured to the site palette at fetch time by
// etl/fetch_team_logos.py (navy ink on papaya paper — a two-tone woodcut, not a
// flat silhouette). Files are local static assets under web/public/team-logos/,
// so this is a plain <img>: no next/image, and no next.config remotePatterns.
// The hand-drawn wobble comes from the shared #sketch filter (SketchDefs).
export function TeamLogo({
  teamId,
  teamName,
  size = 28,
}: {
  teamId: number;
  teamName: string;
  size?: number;
}) {
  if (!hasTeamLogo(teamId)) {
    // No mark on disk — fall back to the abbreviation badge rather than a
    // broken image.
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-navy/10 text-[10px] font-semibold text-navy/70"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {teamAbbr(teamId, teamName)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/team-logos/${teamId}.svg`}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      // The #sketch reference is applied inline, NOT via a Tailwind class: a
      // fragment-only url() inside an external stylesheet resolves against the
      // stylesheet's URL in WebKit/Chromium, not the document's, so the filter
      // silently no-ops. An inline style always resolves against the document.
      style={{ width: size, height: size, filter: "url(#sketch)" }}
    />
  );
}

// Shared team identity cell: logo + clinch marker + name. Used by the division
// tables, the wild card tables and the home playoff-race block so the Jays
// highlight and the marker placement stay consistent across all three.
export function TeamCell({
  teamId,
  teamName,
  marker,
  short = false,
}: {
  teamId: number;
  teamName: string;
  marker?: string | null;
  short?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <TeamLogo teamId={teamId} teamName={teamName} size={short ? 24 : 28} />
      <span className="truncate">
        {marker && (
          <sup className="mr-0.5 text-[10px] font-semibold text-brick">
            {marker}
          </sup>
        )}
        {short ? teamAbbr(teamId, teamName) : teamName}
      </span>
    </span>
  );
}
