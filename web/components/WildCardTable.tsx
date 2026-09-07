import { getTranslations } from "next-intl/server";
import ScorecardFrame from "./ScorecardFrame";
import { TeamCell } from "./TeamLogo";
import {
  HEAD_ROW,
  rowBg,
  TD,
  TD_FIRST,
  TD_LAST,
  TH,
  TH_FIRST,
  TH_LAST,
} from "./standings-chrome";
import {
  clinchMarker,
  gb,
  int0,
  pct3,
  record,
  wildCardRace,
  type StandingsRow,
} from "@/lib/standings";

// P11: the wild card race for one league. Division leaders are excluded — they
// hold seeds 1-3, and MLB reports wildCardGamesBack '-' for them too, so
// leaving them in would put a division leader on the cut line.
//
// The cut line sits after wild card rank 3: everyone above it is currently in.
// It's drawn as a heavy brick rule across the row — the one place the table
// breaks its ledger rhythm, because it's the only line that means something.
export default async function WildCardTable({
  title,
  rows,
  leagueId,
  seedKey,
}: {
  title: string;
  rows: StandingsRow[];
  leagueId: number;
  seedKey: string;
}) {
  const t = await getTranslations("Standings");
  const { inside, outside } = wildCardRace(rows, leagueId);
  if (inside.length === 0 && outside.length === 0) return null;

  const line = (r: StandingsRow, i: number, cut: boolean) => (
    <tr
      key={r.team_id}
      className={`text-navy ${rowBg(r, i)} ${
        cut ? "[&>td]:border-t-2 [&>td]:border-brick" : ""
      }`}
    >
      <td className={TD_FIRST}>
        <TeamCell
          teamId={r.team_id}
          teamName={r.team_name}
          marker={clinchMarker(r)}
        />
      </td>
      <td className={TD}>{int0(r.w)}</td>
      <td className={TD}>{int0(r.l)}</td>
      <td className={TD}>{pct3(r.pct)}</td>
      <td className={TD}>{gb(r.wc_games_back)}</td>
      <td className={TD}>{record(r.l10_w, r.l10_l)}</td>
      <td className={TD_LAST}>{r.streak_code ?? "—"}</td>
    </tr>
  );

  return (
    <ScorecardFrame seedKey={seedKey} variant="panel">
      <div className="relative z-10 p-4">
        <h3 className="font-display text-base uppercase tracking-wide text-navy">
          {title}
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-right text-sm tabular-nums">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH_FIRST}>{t("team")}</th>
                <th className={TH}>W</th>
                <th className={TH}>L</th>
                <th className={TH}>PCT</th>
                <th className={TH}>WCGB</th>
                <th className={TH}>L10</th>
                <th className={TH_LAST}>STRK</th>
              </tr>
            </thead>
            <tbody>
              {inside.map((r, i) => line(r, i, false))}
              {outside.map((r, i) => line(r, inside.length + i, i === 0))}
            </tbody>
          </table>
        </div>
        {/* Prose, so NOT font-display: Graduate has no lowercase and would
            render this sentence in unreadable all-caps (CLAUDE.md typography). */}
        <p className="mt-2 text-[11px] text-brick">{t("cutLine")}</p>
      </div>
    </ScorecardFrame>
  );
}
