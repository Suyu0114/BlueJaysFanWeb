import { getTranslations } from "next-intl/server";
import { TeamCell } from "./TeamLogo";
import { HEAD_ROW, rowBg, TD, TD_LAST, TH, TH_LAST } from "./standings-chrome";
import {
  clinchMarker,
  gb,
  int0,
  pct3,
  playoffPicture,
  type StandingsRow,
} from "@/lib/standings";

// P11 (home module): the AL postseason picture at a glance — seeds 1-3 are the
// division leaders by overall league record, seeds 4-6 the wild cards, then the
// cut line and the clubs still chasing.
export default async function PlayoffRace({
  rows,
  leagueId,
}: {
  rows: StandingsRow[];
  leagueId: number;
}) {
  const t = await getTranslations("Standings");
  const { seeds, chasers } = playoffPicture(rows, leagueId);
  if (seeds.length === 0) return null;

  const line = (
    r: StandingsRow,
    seed: number | null,
    i: number,
    cut: boolean,
  ) => (
    <tr
      key={r.team_id}
      className={`text-navy ${rowBg(r, i)} ${
        cut ? "[&>td]:border-t-2 [&>td]:border-brick" : ""
      }`}
    >
      <td className="w-6 py-1.5 pl-2 pr-1 text-left font-display text-[11px] text-navy/55">
        {seed ?? "—"}
      </td>
      <td className="py-1.5 pr-2 text-left">
        <TeamCell
          teamId={r.team_id}
          teamName={r.team_name}
          marker={clinchMarker(r)}
          short
        />
      </td>
      <td className={TD}>{int0(r.w)}</td>
      <td className={TD}>{int0(r.l)}</td>
      <td className={TD}>{pct3(r.pct)}</td>
      <td className={TD_LAST}>{gb(r.wc_games_back)}</td>
    </tr>
  );

  return (
    <div>
      <h3 className="font-display text-base uppercase tracking-wide text-navy">
        {t("playoffRaceTitle")}
      </h3>
      <table className="mt-2 w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
        <thead>
          <tr className={HEAD_ROW}>
            <th className="py-1.5 pl-2 pr-1 text-left font-display text-[11px] font-normal uppercase tracking-wider first:rounded-l-md">
              #
            </th>
            <th className="py-1.5 pr-2 text-left font-display text-[11px] font-normal uppercase tracking-wider">
              {t("team")}
            </th>
            <th className={TH}>W</th>
            <th className={TH}>L</th>
            <th className={TH}>PCT</th>
            <th className={TH_LAST}>WCGB</th>
          </tr>
        </thead>
        <tbody>
          {seeds.map((r, i) => line(r, i + 1, i, false))}
          {chasers.map((r, i) => line(r, null, seeds.length + i, i === 0))}
        </tbody>
      </table>
      {/* Prose, so NOT font-display (Graduate has no lowercase). */}
      <p className="mt-2 text-[11px] text-brick">{t("cutLine")}</p>
    </div>
  );
}
