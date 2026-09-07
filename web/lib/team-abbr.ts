// MLB Stats API team id -> short code, for compact calendar cells. Team ids are
// stable; the full opponent_name (English) is still shown in tooltips / the game
// detail page. Codes themselves are baseball jargon and stay English in zh-TW.
const TEAM_ABBR: Record<number, string> = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
  113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
  118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "ATH",
  134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
  139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
  144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
};

export function teamAbbr(teamId: number, fallbackName?: string): string {
  return (
    TEAM_ABBR[teamId] ??
    (fallbackName ? fallbackName.split(" ").pop()! : String(teamId))
  );
}

// P11: the recoloured cap logos in web/public/team-logos/ were generated from
// the same 30-club list as TEAM_ABBR, so membership here is an exact proxy for
// "a logo file exists" -- no filesystem probe needed at render time.
export function hasTeamLogo(teamId: number): boolean {
  return teamId in TEAM_ABBR;
}
