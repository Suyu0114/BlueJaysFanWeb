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
  diff,
  gb,
  int0,
  pct3,
  record,
  type StandingsRow,
} from "@/lib/standings";

// P11: one division table, laid out like mlb.com/standings but wearing the
// site's hand-drawn scorecard chrome — rough.js parchment frame, navy varsity
// header bar, ledger-striped papaya rows.
//
// Column abbreviations (W, L, PCT, GB, WCGB, L10, STRK, RS, RA, DIFF, X-W/L,
// HOME, AWAY) are baseball jargon and stay English in both locales per
// CLAUDE.md; only the division heading is translated.
export default async function StandingsTable({
  title,
  rows,
  seedKey,
}: {
  title: string;
  rows: StandingsRow[];
  seedKey: string;
}) {
  const t = await getTranslations("Standings");
  if (rows.length === 0) return null;

  return (
    <ScorecardFrame seedKey={seedKey} variant="panel">
      <div className="relative z-10 p-4">
        <h3 className="font-display text-base uppercase tracking-wide text-navy">
          {title}
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-right text-sm tabular-nums">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH_FIRST}>{t("team")}</th>
                <th className={TH}>W</th>
                <th className={TH}>L</th>
                <th className={TH}>PCT</th>
                <th className={TH}>GB</th>
                <th className={TH}>WCGB</th>
                <th className={TH}>L10</th>
                <th className={TH}>STRK</th>
                <th className={TH}>RS</th>
                <th className={TH}>RA</th>
                <th className={TH}>DIFF</th>
                <th className={TH}>X-W/L</th>
                <th className={TH}>HOME</th>
                <th className={TH_LAST}>AWAY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.team_id} className={`text-navy ${rowBg(r, i)}`}>
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
                  <td className={TD}>{gb(r.games_back)}</td>
                  <td className={TD}>{gb(r.wc_games_back)}</td>
                  <td className={TD}>{record(r.l10_w, r.l10_l)}</td>
                  <td className={TD}>{r.streak_code ?? "—"}</td>
                  <td className={TD}>{int0(r.runs_scored)}</td>
                  <td className={TD}>{int0(r.runs_allowed)}</td>
                  <td className={TD}>{diff(r.run_diff)}</td>
                  <td className={TD}>{record(r.x_w, r.x_l)}</td>
                  <td className={TD}>{record(r.home_w, r.home_l)}</td>
                  <td className={TD_LAST}>{record(r.away_w, r.away_l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ScorecardFrame>
  );
}
