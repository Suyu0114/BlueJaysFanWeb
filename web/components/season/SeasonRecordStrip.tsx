import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/motion/Reveal";
import RankChip from "@/components/team/RankChip";
import { DIVISION_KEY, TORONTO_TEAM_ID, type StandingsRow } from "@/lib/standings";
import { longestStreak, runs, winLoss, winPct, type TeamGame } from "@/lib/team-season";
import { deltaTone, type Direction } from "@/lib/season-deltas";
import { ordinal } from "@/lib/ordinal";
import { r3, signed, streakText, wl } from "@/lib/season-format";
import { rankKey, tiedRank, type MetricKey } from "@/lib/team-metrics";
import type { TeamSeasonRow } from "@/lib/team-trends";

// The season page's record strip (P12 M5): record, PCT, runs scored / allowed,
// run differential, expected W-L, division finish and longest win streak, each
// with a Δ chip vs the prior season and, since P13, the MLB rank among 30 from
// the 022 views (never re-ranked here). Also an article figure.

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

export default async function SeasonRecordStrip({
  season,
  prior,
  games,
  priorGames,
  standings,
  priorStandings,
  clubs,
  locale,
  className = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4",
}: {
  season: number;
  prior: number | null;
  games: TeamGame[];
  priorGames: TeamGame[];
  standings: StandingsRow[];
  priorStandings: StandingsRow[];
  clubs: TeamSeasonRow[]; // 022 view rows for `season` (ranks); [] hides the rank chips
  locale: string;
  className?: string; // grid columns: the article column is narrower than the season page
}) {
  const t = await getTranslations("Season");
  const ts = await getTranslations("Standings");

  const me = standings.find((r) => r.team_id === TORONTO_TEAM_ID);
  const pme = priorStandings.find((r) => r.team_id === TORONTO_TEAM_ID);
  const jaysRow = clubs.find((r) => r.team_id === TORONTO_TEAM_ID && r.season === season);
  const rankOf = (key: MetricKey, hint: string) => {
    const rank = jaysRow?.[rankKey(key)];
    return rank == null ? null : { rank, tied: tiedRank(clubs, season, key, rank), hint };
  };

  const rec = winLoss(games);
  const prec = prior ? winLoss(priorGames) : null;
  const run = runs(games);
  const prun = prior ? runs(priorGames) : null;
  const pct = winPct(rec);
  const ppct = prec ? winPct(prec) : null;

  const statCard = (
    label: string,
    value: string,
    chip: ReactNode,
    priorText?: string | null,
    hint?: string,
    rank?: { rank: number; tied: boolean; hint: string } | null,
  ) => (
    <div className="rounded-md border border-steel/25 bg-papaya/60 px-3 py-2">
      <div className="font-display text-[11px] uppercase tracking-wider text-navy/55">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
        {value}
        {chip}
      </div>
      {rank && (
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-navy/55" title={rank.hint}>
          {t("rankLabel")}
          <RankChip rank={rank.rank} tied={rank.tied} locale={locale} small />
        </div>
      )}
      {priorText && <div className="text-[11px] text-navy/50">{priorText}</div>}
      {hint && <div className="text-[10px] leading-tight text-navy/45">{hint}</div>}
    </div>
  );
  const priorLine = (v: string | null) => (prior && v != null ? t("priorValue", { season: prior, value: v }) : null);
  const divisionText = (row: StandingsRow | undefined) =>
    row && row.division_rank != null
      ? t("divisionValue", { rank: ordinal(row.division_rank, locale), division: ts(DIVISION_KEY[row.division_id] ?? "alEast") })
      : "—";
  const streak = (gs: TeamGame[]) => streakText(longestStreak(gs, "W"), locale, (v) => t("streakValue", v));

  return (
    <Reveal className={className}>
      {statCard(t("statRecord"), wl(rec), prec && <Chip d={rec.w - prec.w} direction="higher" fmt={(d) => `${signed(d)} W`} />, priorLine(prec && wl(prec)))}
      {statCard("PCT", r3(pct), ppct != null && pct != null && <Chip d={pct - ppct} direction="higher" fmt={(d) => (d >= 0 ? "+" : "−") + r3(Math.abs(d))} />, priorLine(ppct != null ? r3(ppct) : null), undefined, rankOf("pct", t("rankHint")))}
      {statCard(t("statRs"), String(run.rs), prun && <Chip d={run.rs - prun.rs} direction="higher" />, priorLine(prun && String(prun.rs)), undefined, rankOf("r_per_g", t("rankHintRs")))}
      {statCard(t("statRa"), String(run.ra), prun && <Chip d={run.ra - prun.ra} direction="lower" />, priorLine(prun && String(prun.ra)), undefined, rankOf("ra_per_g", t("rankHintRa")))}
      {statCard(t("statDiff"), signed(run.diff), prun && <Chip d={run.diff - prun.diff} direction="higher" />, priorLine(prun && signed(prun.diff)), undefined, rankOf("run_diff", t("rankHint")))}
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
      {statCard(t("streakW"), streak(games), null, priorLine(prior ? streak(priorGames) : null))}
    </Reveal>
  );
}
