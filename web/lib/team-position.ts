import { sql } from "./db";
import { TORONTO_TEAM_ID } from "./team-ids";

// Post-P13: the Blue Jays' offense at each position next to the MLB average at
// that position and their rank among 30 clubs — read from the 025 view
// (web_v_team_position). Groups mirror lib/team-season.ts::batterGroup
// (OF = LF + CF + RF, DH = DH + PH + P). Nothing here computes a rate or a rank.

/** The batting position groups, in the order the season page lists them. */
export const VS_MLB_GROUPS = ["C", "1B", "2B", "3B", "SS", "OF", "DH"] as const;
export type VsMlbGroup = (typeof VS_MLB_GROUPS)[number];

export type PositionVsMlb = {
  group: VsMlbGroup;
  jays: {
    pa: number;
    hr: number;
    ops: number | null;
    hr_rank: number | null;
    hr_tied: boolean;
    ops_rank: number | null;
    ops_tied: boolean;
  };
  /** MLB: OPS from all 30 clubs' summed counts; PA / HR = mean per club. */
  mlb: { pa: number; hr: number; ops: number | null };
};

type ViewRow = {
  team_id: number;
  pos_group: VsMlbGroup;
  pa: number;
  hr: number;
  ops: number | null;
  hr_rank: number | null;
  hr_tied: boolean | null;
  ops_rank: number | null;
  ops_tied: boolean | null;
};

/** One row per group with both a Jays and an MLB row; [] when the season isn't loaded. */
export async function getTeamPositionVsMlb(season: number): Promise<PositionVsMlb[]> {
  const rows = await sql<ViewRow[]>`
    select team_id, pos_group, pa, hr, ops, hr_rank, hr_tied, ops_rank, ops_tied
    from web_v_team_position
    where season = ${season} and team_id in (${TORONTO_TEAM_ID}, 0)
  `;
  return VS_MLB_GROUPS.flatMap((group) => {
    const j = rows.find((r) => r.team_id === TORONTO_TEAM_ID && r.pos_group === group);
    const m = rows.find((r) => r.team_id === 0 && r.pos_group === group);
    if (!j || !m) return [];
    return [
      {
        group,
        jays: {
          pa: j.pa,
          hr: j.hr,
          ops: j.ops,
          hr_rank: j.hr_rank,
          hr_tied: j.hr_tied ?? false,
          ops_rank: j.ops_rank,
          ops_tied: j.ops_tied ?? false,
        },
        mlb: { pa: m.pa, hr: m.hr, ops: m.ops },
      },
    ];
  });
}
