import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import TeamNav from "@/components/TeamNav";
import SlidingPill from "@/components/motion/SlidingPill";
import { Reveal } from "@/components/motion/Reveal";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import SeasonTrendChart from "@/components/season/SeasonTrendChart";
import WarByPositionChart from "@/components/season/WarByPositionChart";
import CopyTableButton from "@/components/CopyTableButton";
import Exportable from "@/components/Exportable";
import { DIVISION_KEY, getStandings, TORONTO_TEAM_ID } from "@/lib/standings";
import { getTeamGames, getTeamPlayerSeasons, getTeamSeasons } from "@/lib/team-season-data";
import {
  gamesAboveSeries,
  LEADER_MIN_IP,
  LEADER_MIN_PA,
  longestStreak,
  monthlyRecords,
  POSITION_GROUPS,
  runDiffSeries,
  runs,
  seasonSplits,
  teamLeaders,
  warByPosition,
  winLoss,
  winPct,
  type LeaderCategory,
  type SplitKey,
  type Streak,
  type WinLoss,
} from "@/lib/team-season";
import { deltaTone, overlayByGame, type Direction } from "@/lib/season-deltas";
import { getLeagueSeason } from "@/lib/savant";
import { ordinal } from "@/lib/ordinal";

// P12 M5: the Blue Jays' regular season on one page, vs the season before —
// record, games above .500 and run differential by game number, month by
// month, splits, leaders, WAR by position. Game-by-game numbers come from
// web_games (game_type 'R'); x-W/L, division finish and opponents' final
// winning % from web_standings; player numbers are Jays-scoped. All the math is
// in the pure lib/team-season.ts, which P13 reuses across five seasons.

export const revalidate = 3600;

export async function generateStaticParams() {
  const seasons = await getTeamSeasons();
  return seasons.map((s) => ({ year: String(s) }));
}

const r3 = (v: number | null) => {
  if (v == null) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
};
const signed = (v: number, d = 0) => (v > 0 ? `+${v.toFixed(d)}` : v < 0 ? `−${Math.abs(v).toFixed(d)}` : `±${(0).toFixed(d)}`);
const wl = (r: WinLoss) => `${r.w}-${r.l}`;

const TONE = {
  better: "bg-grass/25 text-navy",
  worse: "bg-brick/15 text-lava",
  flat: "bg-navy/5 text-navy/60",
} as const;

function Chip({ d, direction, digits = 0, fmt }: { d: number | null; direction: Direction; digits?: number; fmt?: (d: number) => string }) {
  if (d == null) return null;
  return (
    <span className={`ml-2 inline-block rounded-full px-1.5 text-xs tabular-nums ${TONE[deltaTone(d, direction)]}`}>
      {fmt ? fmt(d) : signed(d, digits)}
    </span>
  );
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ locale: string; year: string }>;
}) {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const season = Number(year);
  const seasons = await getTeamSeasons();
  if (!Number.isInteger(season) || !seasons.includes(season)) notFound();
  const prior = seasons.includes(season - 1) ? season - 1 : null;

  const t = await getTranslations("Season");
  const ts = await getTranslations("Standings");

  const [games, priorGames, standings, priorStandings, players, league] = await Promise.all([
    getTeamGames(season),
    prior ? getTeamGames(prior) : Promise.resolve([]),
    getStandings(season),
    prior ? getStandings(prior) : Promise.resolve([]),
    getTeamPlayerSeasons(prior ? [season, prior] : [season]),
    getLeagueSeason(season), // P12 M6: MLB-average reference for the leaders
  ]);

  const me = standings.find((r) => r.team_id === TORONTO_TEAM_ID);
  const pme = priorStandings.find((r) => r.team_id === TORONTO_TEAM_ID);
  const ctxFor = (rows: typeof standings) => ({
    ownDivision: rows.find((r) => r.team_id === TORONTO_TEAM_ID)?.division_id ?? 201,
    divisionOf: new Map(rows.map((r) => [r.team_id, r.division_id])),
    pctOf: new Map(rows.filter((r) => r.pct != null).map((r) => [r.team_id, r.pct as number])),
  });

  // ---- record strip ---------------------------------------------------------
  const rec = winLoss(games);
  const prec = prior ? winLoss(priorGames) : null;
  const run = runs(games);
  const prun = prior ? runs(priorGames) : null;
  const pct = winPct(rec);
  const ppct = prec ? winPct(prec) : null;

  const statCard = (
    label: string,
    value: string,
    chip: React.ReactNode,
    priorText?: string | null,
    hint?: string,
  ) => (
    <div className="rounded-md border border-steel/25 bg-papaya/60 px-3 py-2">
      <div className="font-display text-[11px] uppercase tracking-wider text-navy/55">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
        {value}
        {chip}
      </div>
      {priorText && <div className="text-[11px] text-navy/50">{priorText}</div>}
      {hint && <div className="text-[10px] leading-tight text-navy/45">{hint}</div>}
    </div>
  );
  const priorLine = (v: string | null) => (prior && v != null ? t("priorValue", { season: prior, value: v }) : null);
  const divisionText = (row: typeof me) =>
    row && row.division_rank != null
      ? t("divisionValue", { rank: ordinal(row.division_rank, locale), division: ts(DIVISION_KEY[row.division_id] ?? "alEast") })
      : "—";

  // ---- series ----------------------------------------------------------------
  const above = overlayByGame(gamesAboveSeries(games), prior ? gamesAboveSeries(priorGames) : undefined, (p) => p.value);
  const rdiff = overlayByGame(runDiffSeries(games), prior ? runDiffSeries(priorGames) : undefined, (p) => p.value);

  // ---- months / splits ---------------------------------------------------------
  const months = monthlyRecords(games);
  const pmonths = monthlyRecords(priorGames);
  const monthKeys = [...new Set([...months, ...pmonths].map((m) => m.month))].sort((a, b) => a - b);
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const monthLabel = (m: number) =>
    m === 4 ? t("monthMarApr") : m === 9 ? t("monthSepOct") : monthFmt.format(new Date(Date.UTC(2000, m - 1, 1)));

  const splits = seasonSplits(games, ctxFor(standings));
  const psplits = prior ? seasonSplits(priorGames, ctxFor(priorStandings)) : null;
  const ownDivisionName = ts(DIVISION_KEY[ctxFor(standings).ownDivision] ?? "alEast");
  const splitRows: { key: SplitKey; label: string }[] = [
    { key: "home", label: t("splitHome") },
    { key: "away", label: t("splitAway") },
    { key: "oneRun", label: t("splitOneRun") },
    { key: "blowouts", label: t("splitBlowouts") },
    { key: "vsDivision", label: t("splitVsDivision", { division: ownDivisionName }) },
    { key: "vsWinning", label: t("splitVsWinning") },
    { key: "vsLosing", label: t("splitVsLosing") },
  ];
  const dayFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const streakText = (s: Streak) =>
    s
      ? t("streakValue", {
          n: s.length,
          from: dayFmt.format(new Date(`${s.start}T00:00:00Z`)),
          to: dayFmt.format(new Date(`${s.end}T00:00:00Z`)),
        })
      : "—";

  // ---- leaders / WAR ------------------------------------------------------------
  // Player numbers (web_player_season_stats) start in 2024, while schedules and
  // standings may reach further back: hide the player modules for a season with
  // no player rows, and never compare against a prior season that has none.
  const hasPlayers = (s: number | null) => s != null && players.some((r) => r.season === s);
  const playerPrior = hasPlayers(prior) ? prior : null;
  const leaders = teamLeaders(players, season, playerPrior);
  const cats: { key: LeaderCategory; label: string; fmt: (v: number) => string }[] = [
    { key: "war", label: "WAR", fmt: (v) => v.toFixed(1) },
    { key: "ops", label: "OPS", fmt: (v) => r3(v) },
    { key: "hr", label: "HR", fmt: (v) => v.toFixed(0) },
    { key: "era", label: "ERA", fmt: (v) => v.toFixed(2) },
    { key: "so", label: "SO", fmt: (v) => v.toFixed(0) },
  ];
  const war = warByPosition(players, season);
  const pwar = playerPrior ? warByPosition(players, playerPrior) : null;
  const warData = POSITION_GROUPS.map((g) => ({ group: g, a: +war[g].toFixed(2), b: pwar ? +pwar[g].toFixed(2) : null }));
  const warTotal = Object.values(war).reduce((a, b) => a + b, 0);
  const pwarTotal = pwar ? Object.values(pwar).reduce((a, b) => a + b, 0) : null;

  // M7: `copy` adds a "Copy table" button (plain headers + rows) to the panel header.
  const panel = (
    seedKey: string,
    title: string,
    children: React.ReactNode,
    note?: React.ReactNode,
    copy?: { headers: (string | number)[]; rows: (string | number)[][] },
  ) => (
    <Reveal>
      <ScorecardFrame seedKey={seedKey} variant="panel">
        <div className="relative z-10 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-base uppercase tracking-wide text-navy">{title}</h2>
            {copy && <CopyTableButton headers={copy.headers} rows={copy.rows} />}
          </div>
          <div className="mt-2">{children}</div>
          {note && <p className="mt-2 text-[11px] leading-snug text-navy/55">{note}</p>}
        </div>
      </ScorecardFrame>
    </Reveal>
  );

  const legend = prior != null && (
    <span className="flex items-center gap-2 text-xs text-navy/55">
      <span className="inline-block h-0.5 w-4 bg-brick" aria-hidden />
      {season}
      <span className="inline-block w-4 border-t-2 border-dashed border-steel" aria-hidden />
      {prior}
    </span>
  );
  const barLegend = playerPrior != null && (
    <span className="flex items-center gap-2 text-xs text-navy/55">
      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brick" aria-hidden />
      {season}
      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-steel" aria-hidden />
      {playerPrior}
    </span>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <TeamNav active="season" season={season} />
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-navy">{t("title", { season })}</h1>
          <p className="mt-1 text-sm text-navy/60">
            {prior ? t("subtitle", { prior }) : t("subtitleNoPrior")}
          </p>
        </div>
        {seasons.length > 1 && (
          <ScorecardFrame seedKey="season-switch" variant="control" className="text-xs">
            <div role="tablist" aria-label={t("switcherLabel")} className="relative z-10 flex p-1">
              {[...seasons].sort((a, b) => a - b).map((s) => {
                const active = s === season;
                return (
                  <Link
                    key={s}
                    href={`/season/${s}`}
                    role="tab"
                    aria-selected={active}
                    className={`relative px-3 py-1 font-medium transition-colors ${active ? "text-papaya" : "text-navy/65 hover:text-navy"}`}
                  >
                    {active && <SlidingPill group="season-switch" />}
                    <span className="relative z-10">{s}</span>
                  </Link>
                );
              })}
            </div>
          </ScorecardFrame>
        )}
      </Reveal>

      {games.length === 0 ? (
        <p className="mt-8 text-navy/55">{t("empty", { season })}</p>
      ) : (
        <div className="mt-6 space-y-6">
          {/* 1. Record strip */}
          <Reveal className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {statCard(t("statRecord"), wl(rec), prec && <Chip d={rec.w - prec.w} direction="higher" fmt={(d) => `${signed(d)} W`} />, priorLine(prec && wl(prec)))}
            {statCard("PCT", r3(pct), ppct != null && pct != null && <Chip d={pct - ppct} direction="higher" fmt={(d) => (d >= 0 ? "+" : "−") + r3(Math.abs(d))} />, priorLine(ppct != null ? r3(ppct) : null))}
            {statCard(t("statRs"), String(run.rs), prun && <Chip d={run.rs - prun.rs} direction="higher" />, priorLine(prun && String(prun.rs)))}
            {statCard(t("statRa"), String(run.ra), prun && <Chip d={run.ra - prun.ra} direction="lower" />, priorLine(prun && String(prun.ra)))}
            {statCard(t("statDiff"), signed(run.diff), prun && <Chip d={run.diff - prun.diff} direction="higher" />, priorLine(prun && signed(prun.diff)))}
            {statCard(
              t("statXwl"),
              me?.x_w != null ? `${me.x_w}-${me.x_l}` : "—",
              pme?.x_w != null && me?.x_w != null && <Chip d={me.x_w - pme.x_w} direction="higher" fmt={(d) => `${signed(d)} W`} />,
              priorLine(pme?.x_w != null ? `${pme.x_w}-${pme.x_l}` : null),
              t("statXwlHint"),
            )}
            {statCard(
              t("statDivision"),
              divisionText(me),
              null,
              priorLine(pme ? divisionText(pme) : null),
              me?.games_back && me.games_back !== "-" ? t("gb", { gb: me.games_back }) : undefined,
            )}
            {statCard(t("streakW"), streakText(longestStreak(games, "W")), null, priorLine(prior ? streakText(longestStreak(priorGames, "W")) : null))}
          </Reveal>

          {/* 2–3. Games above .500 and run differential by game number */}
          <div className="grid gap-6 lg:grid-cols-2">
            {panel(
              "season-above",
              t("aboveTitle"),
              <>
                {legend}
                <Exportable name={`blue jays games above 500 ${season}`} caption={`Blue Jays · ${t("aboveTitle")} · ${season}${prior ? ` vs ${prior}` : ""}`}>
                  <SeasonTrendChart points={above} season={season} priorSeason={prior} labels={{ game: t("gameLabel") }} />
                </Exportable>
              </>,
              t("aboveNote"),
            )}
            {panel(
              "season-rundiff",
              t("runDiffTitle"),
              <>
                {legend}
                <Exportable name={`blue jays run differential ${season}`} caption={`Blue Jays · ${t("runDiffTitle")} · ${season}${prior ? ` vs ${prior}` : ""}`}>
                  <SeasonTrendChart points={rdiff} season={season} priorSeason={prior} labels={{ game: t("gameLabel") }} />
                </Exportable>
              </>,
              t("runDiffNote"),
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 4. Monthly record */}
            {panel(
              "season-months",
              t("monthlyTitle"),
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th className={TH_FIRST}>{t("colMonth")}</th>
                      <th className={TH}>{season}</th>
                      <th className={TH}>RS-RA</th>
                      {prior && <th className={TH}>{prior}</th>}
                      {prior && <th className={TH_LAST}>RS-RA</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {monthKeys.map((m, i) => {
                      const a = months.find((x) => x.month === m);
                      const b = pmonths.find((x) => x.month === m);
                      return (
                        <tr key={m} className={stripeBg(i)}>
                          <td className={TD_FIRST}>{monthLabel(m)}</td>
                          <td className={`${TD} font-semibold`}>{a ? wl(a) : "—"}</td>
                          <td className={`${TD} text-navy/60`}>{a ? `${a.rs}-${a.ra}` : "—"}</td>
                          {prior && <td className={TD}>{b ? wl(b) : "—"}</td>}
                          {prior && <td className={`${TD_LAST} text-navy/60`}>{b ? `${b.rs}-${b.ra}` : "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>,
              t("monthlyNote"),
              {
                headers: [t("colMonth"), season, "RS-RA", ...(prior ? [prior, "RS-RA"] : [])],
                rows: monthKeys.map((m) => {
                  const a = months.find((x) => x.month === m);
                  const b = pmonths.find((x) => x.month === m);
                  return [
                    monthLabel(m),
                    a ? wl(a) : "",
                    a ? `${a.rs}-${a.ra}` : "",
                    ...(prior ? [b ? wl(b) : "", b ? `${b.rs}-${b.ra}` : ""] : []),
                  ];
                }),
              },
            )}

            {/* 5. Splits */}
            {panel(
              "season-splits",
              t("splitsTitle"),
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th className={TH_FIRST}>{t("colSplit")}</th>
                      <th className={TH}>{season}</th>
                      <th className={prior ? TH : TH_LAST}>PCT</th>
                      {prior && <th className={TH}>{prior}</th>}
                      {prior && <th className={TH_LAST}>PCT</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {splitRows.map((r, i) => {
                      const a = splits[r.key];
                      const b = psplits?.[r.key];
                      return (
                        <tr key={r.key} className={stripeBg(i)}>
                          <td className={TD_FIRST}>{r.label}</td>
                          <td className={`${TD} font-semibold`}>{wl(a)}</td>
                          <td className={`${prior ? TD : TD_LAST} text-navy/60`}>{r3(winPct(a))}</td>
                          {prior && <td className={TD}>{b ? wl(b) : "—"}</td>}
                          {prior && <td className={`${TD_LAST} text-navy/60`}>{b ? r3(winPct(b)) : "—"}</td>}
                        </tr>
                      );
                    })}
                    <tr className={stripeBg(splitRows.length)}>
                      <td className={TD_FIRST}>{t("streakL")}</td>
                      <td className={`${TD} font-semibold`} colSpan={2}>{streakText(longestStreak(games, "L"))}</td>
                      {prior && <td className={TD_LAST} colSpan={2}>{streakText(longestStreak(priorGames, "L"))}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>,
              t("splitsNote"),
              {
                headers: [t("colSplit"), season, "PCT", ...(prior ? [prior, "PCT"] : [])],
                rows: splitRows.map((r) => {
                  const a = splits[r.key];
                  const b = psplits?.[r.key];
                  return [r.label, wl(a), r3(winPct(a)), ...(prior ? [b ? wl(b) : "", b ? r3(winPct(b)) : ""] : [])];
                }),
              },
            )}
          </div>

          {!hasPlayers(season) && (
            <p className="text-sm text-navy/55">{t("noPlayerData", { season })}</p>
          )}

          {/* 6. Team leaders */}
          {hasPlayers(season) && panel(
            "season-leaders",
            t("leadersTitle"),
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {cats.map((c) => (
                <div key={c.key} className="rounded-md border border-steel/20 bg-papaya/60 p-2">
                  <div className="font-display text-[11px] uppercase tracking-wider text-navy/60">{c.label}</div>
                  <ol className="mt-1 space-y-1 text-sm">
                    {leaders[c.key].length === 0 && <li className="text-navy/45">—</li>}
                    {leaders[c.key].map((l) => (
                      <li key={l.mlbam_id} className="flex items-baseline justify-between gap-2">
                        <Link href={`/players/${l.mlbam_id}`} className="truncate text-navy hover:text-brick">
                          {l.name}
                        </Link>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-semibold text-navy">{c.fmt(l.value)}</span>
                          {playerPrior && (
                            <span className="ml-1 text-[11px] text-navy/45">{l.prior == null ? "—" : c.fmt(l.prior)}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>,
            <>
              {playerPrior
                ? t("leadersNote", { pa: LEADER_MIN_PA, ip: LEADER_MIN_IP, prior: playerPrior })
                : t("leadersNoteNoPrior", { pa: LEADER_MIN_PA, ip: LEADER_MIN_IP })}
              {league?.ops != null && league.era != null && (
                <span className="mt-0.5 block">
                  {t("leagueRef", { season, ops: r3(league.ops), era: league.era.toFixed(2) })}
                </span>
              )}
            </>,
          )}

          {/* 7. WAR by position group */}
          {hasPlayers(season) && panel(
            "season-war",
            t("warTitle"),
            <>
              {barLegend}
              <Exportable name={`blue jays war by position ${season}`} caption={`Blue Jays · ${t("warTitle")} · ${season}${playerPrior ? ` vs ${playerPrior}` : ""}`}>
                <WarByPositionChart data={warData} season={season} priorSeason={playerPrior} />
              </Exportable>
            </>,
            t("warNote", {
              total: warTotal.toFixed(1),
              prior: playerPrior ? t("warPriorTotal", { season: playerPrior, total: (pwarTotal ?? 0).toFixed(1) }) : "",
            }),
          )}
        </div>
      )}
    </div>
  );
}
