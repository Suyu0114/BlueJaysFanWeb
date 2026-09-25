import { TORONTO_TEAM_ID, type StandingsRow } from "@/lib/standings";

// P11: shared hand-drawn scorecard chrome for the four standings tables, so the
// division tables, the wild card tables and the home playoff-race block read as
// one object instead of three near-misses.
//
// The vocabulary is borrowed wholesale from ScheduleCalendar — navy header bar
// in the Graduate varsity face, papaya rows floating on the dirt parchment the
// ScorecardFrame paints underneath. Nothing new is introduced.

/** Navy bar header row, matching the calendar's weekday strip. */
export const HEAD_ROW = "bg-navy text-papaya";

/** Header cell: Graduate is an all-caps display face, so labels only. */
const TH_BASE =
  "py-1.5 font-display text-[11px] font-normal uppercase tracking-wider";
export const TH = `px-2 ${TH_BASE}`;
export const TH_FIRST = `pl-3 pr-2 text-left ${TH_BASE} first:rounded-l-md`;
export const TH_LAST = `pl-2 pr-3 ${TH_BASE} last:rounded-r-md`;

export const TD = "px-2 py-1.5";
export const TD_FIRST = "py-1.5 pl-3 pr-2 text-left";
export const TD_LAST = "py-1.5 pl-2 pr-3";

/** Row hover: a soft steel wash that eases in (global 300ms transition). */
const ROW_HOVER = "transition-colors hover:bg-steel/15";

/**
 * Ledger striping on parchment, with the Jays row picked out in brick.
 *
 * Returned as one resolved string rather than stacked `odd:`/`bg-brick`
 * utilities: those collide at equal specificity, where the winner is stylesheet
 * order, not class order — so the Jays row would sometimes lose its highlight
 * depending on how Tailwind happened to emit the rules. (The `hover:` variants
 * are safe: `:hover` adds specificity, so they always win while hovered.)
 */
export function rowBg(row: StandingsRow, index: number): string {
  if (row.team_id === TORONTO_TEAM_ID)
    return "bg-brick/20 font-medium transition-colors hover:bg-brick/30";
  return `${index % 2 === 0 ? "bg-papaya/70" : "bg-papaya/35"} ${ROW_HOVER}`;
}
