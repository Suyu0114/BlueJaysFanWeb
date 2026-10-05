import TableExport from "@/components/TableExport";
import { TeamLogo } from "@/components/TeamLogo";
import { SEASON_TOTAL, type TeamSeasonLine } from "@/lib/compare";
import { teamAbbr } from "@/lib/team-abbr";

// P12 M3: when a compared season spans more than one club (a deadline trade),
// the per-club lines under the season-line card — "TOR Mar 27–Aug 2 · HOU
// Aug 3–Sep 19". Rows come from web_player_team_season_stats; the season total
// is already in the card above, so only the club rows are listed here.

function r3(v: number | null): string {
  if (v == null) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}
const d1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const d2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default function ClubSplits({
  lines,
  seasonA,
  seasonB,
  role,
  locale,
  labels,
  exportName,
}: {
  lines: TeamSeasonLine[];
  seasonA: number;
  seasonB: number;
  role: "batter" | "pitcher";
  locale: string;
  labels: { title: string; club: string; span: string };
  exportName?: string; // player name, leads the table PNG caption
}) {
  const clubRows = (season: number) =>
    lines
      .filter((l) => l.season === season && l.team_id !== SEASON_TOTAL && (l.g ?? 0) > 0)
      .sort((a, b) => (a.first_game ?? "").localeCompare(b.first_game ?? ""));
  const groups = [seasonA, seasonB]
    .map((season) => ({ season, rows: clubRows(season) }))
    .filter((g) => g.rows.length > 1);
  if (groups.length === 0) return null;

  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const fmtDay = (ymd: string | null) => (ymd ? day.format(new Date(`${ymd}T00:00:00Z`)) : "");
  const head =
    role === "batter"
      ? ["G", "PA", "AVG/OBP/SLG", "OPS", "wRC+", "WAR"]
      : ["G", "GS", "IP", "ERA", "FIP", "K%", "BB%", "WAR"];
  const cells = (l: TeamSeasonLine) =>
    role === "batter"
      ? [l.g ?? "—", l.pa ?? "—", `${r3(l.avg)}/${r3(l.obp)}/${r3(l.slg)}`, r3(l.ops), l.wrc_plus == null ? "—" : l.wrc_plus.toFixed(0), d1(l.war)]
      : [l.g ?? "—", l.gs ?? "—", d1(l.ip), d2(l.era), d2(l.fip), pct(l.k_pct), pct(l.bb_pct), d1(l.war)];

  const copyRows = groups.flatMap((g) =>
    g.rows.map((l) => [g.season, teamAbbr(l.team_id), `${fmtDay(l.first_game)} – ${fmtDay(l.last_game)}`, ...cells(l)]),
  );
  const caption = [exportName, labels.title, groups.map((g) => g.season).join(" & ")].filter(Boolean).join(" · ");
  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">{labels.title}</h3>
        <TableExport
          headers={["Season", labels.club, labels.span, ...head]}
          rows={copyRows}
          name={caption}
          caption={caption}
        />
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-navy/10 text-[11px] uppercase tracking-wide text-navy/50">
              <th className="py-1 pr-2 text-left font-semibold">{labels.club}</th>
              <th className="px-2 py-1 text-left font-semibold">{labels.span}</th>
              {head.map((h) => (
                <th key={h} className="px-2 py-1 text-right font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((g) =>
              g.rows.map((l) => (
                <tr key={`${g.season}-${l.team_id}`} className="border-b border-navy/5 last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${g.season === seasonA ? "bg-brick" : "bg-steel"}`}
                        aria-hidden
                      />
                      <span className="text-navy/60">{g.season}</span>
                      <TeamLogo teamId={l.team_id} teamName={teamAbbr(l.team_id)} size={20} />
                      <span className="font-semibold text-navy">{teamAbbr(l.team_id)}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-navy/55">
                    {fmtDay(l.first_game)} – {fmtDay(l.last_game)}
                  </td>
                  {cells(l).map((c, i) => (
                    <td key={i} className="px-2 py-1.5 text-right text-navy">{c}</td>
                  ))}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
