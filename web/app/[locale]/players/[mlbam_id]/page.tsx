import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import PlayerNav from "@/components/PlayerNav";
import SeasonProgressBar from "@/components/SeasonProgressBar";
import WarBreakdown from "@/components/charts/WarBreakdown";
import SeasonStatTable from "@/components/SeasonStatTable";
import RecentForm from "@/components/RecentForm";
import GameLog from "@/components/GameLog";
import ContactQualityCard from "@/components/ContactQualityCard";
import RollingOpsSparkline from "@/components/charts/RollingOpsSparkline";
import PitcherSeasonStatTable from "@/components/PitcherSeasonStatTable";
import PitcherRecentForm from "@/components/PitcherRecentForm";
import PitcherGameLog from "@/components/PitcherGameLog";
import RollingEraSparkline from "@/components/charts/RollingEraSparkline";
import {
  BattedBallProfileCard,
  DisciplineCard,
  PitcherDisciplineCard,
} from "@/components/DisciplineCards";
import CountUp from "@/components/motion/CountUp";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { getPlayer, getPlayerAvailability } from "@/lib/players";
import { getSeasonClubLabels } from "@/lib/compare";
import { Link } from "@/i18n/navigation";
import {
  getBatterGamesPlayed,
  getSeasonStats,
  type SeasonStats,
} from "@/lib/season-stats";
import { getBatterGameLog } from "@/lib/batter-game-log";
import { rollingOps, summarize, windowByDays } from "@/lib/batting-form";
import { getBattedBalls } from "@/lib/batting";
import { computeExitVeloStats } from "@/lib/exit-velo-stats";
import { getPitcherGameLog } from "@/lib/pitcher-game-log";
import {
  getBattedBallProfile,
  getBatterDiscipline,
  getPitcherDiscipline,
  getZoneReference,
  type ZoneReference,
} from "@/lib/discipline";
import { crossesZoneChange } from "@/lib/season-deltas";
import {
  lastNAppearances,
  rollingEra,
  summarizePitching,
} from "@/lib/pitching-form";

export const revalidate = 86400;

function fmt(v: number | null, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

// k_pct/bb_pct are stored as raw fractions (0.245) — see etl/pull_season_stats.py.
function pct1(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

type CountSpec = { value: number; digits: number; scale?: number; suffix?: string };

// Roll-up spec for a plain decimal KPI; undefined (→ static "—") when missing.
function count(
  v: number | null,
  digits: number,
  scale?: number,
  suffix?: string,
): CountSpec | undefined {
  return v != null && Number.isFinite(v) ? { value: v, digits, scale, suffix } : undefined;
}

function KpiCard({
  label,
  value,
  countTo,
  hint,
}: {
  label: string;
  value: string;
  // When set, the number rolls up from 0 on scroll-in (CountUp). Its format
  // must match `value` exactly. Never for W-L or IP (thirds notation).
  countTo?: CountSpec;
  hint?: string;
}) {
  return (
    <RevealItem className="rounded-lg border border-brick/20 bg-white/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-navy/55">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
        {countTo ? <CountUp {...countTo} /> : value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-navy/45">{hint}</div>}
    </RevealItem>
  );
}

// The comparison season for the M2 cards: the newest season with data that is
// older than `season` (rows arrive newest first).
function priorSeason(rows: { season: number }[], season: number): number | null {
  return rows.find((r) => r.season < season)?.season ?? null;
}

function pickLatest(stats: SeasonStats[]): {
  latest: SeasonStats | null;
  prior: SeasonStats | null;
} {
  const sorted = [...stats].sort((a, b) => b.season - a.season);
  return { latest: sorted[0] ?? null, prior: sorted[1] ?? null };
}

export default async function PlayerOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; mlbam_id: string }>;
}) {
  const { locale, mlbam_id } = await params;
  setRequestLocale(locale);

  const playerId = Number(mlbam_id);
  if (!Number.isFinite(playerId)) notFound();

  const t = await getTranslations("Overview");

  const [player, availability, stats, clubLabels] = await Promise.all([
    getPlayer(playerId),
    getPlayerAvailability(playerId),
    getSeasonStats(playerId),
    getSeasonClubLabels(playerId),
  ]);

  if (!player) notFound();

  const { latest, prior } = pickLatest(stats);

  // P12: everything on the overview is as a Blue Jay. When he also played for
  // other clubs (2024-2026), point to the Compare tab's full-MLB seasons.
  // "SD (2024, 2025), HOU (2026)"
  const otherClubSeasons = new Map<string, string[]>();
  for (const [season, label] of Object.entries(clubLabels).sort(([a], [b]) => Number(a) - Number(b))) {
    for (const club of label.split("/")) {
      if (club !== "TOR") otherClubSeasons.set(club, [...(otherClubSeasons.get(club) ?? []), season]);
    }
  }
  const otherClubs = [...otherClubSeasons].map(([club, seasons]) => `${club} (${seasons.join(", ")})`);

  // Two-way is rare; pick the dominant role for the progress bar based on
  // which stat columns are present in the latest season.
  const role: "batter" | "pitcher" =
    availability.pitching && !availability.batting
      ? "pitcher"
      : latest && latest.era != null && latest.ops == null
        ? "pitcher"
        : "batter";

  const gamesPlayed =
    role === "batter" && latest
      ? await getBatterGamesPlayed(playerId, latest.season)
      : 0;

  const canShowProgress =
    latest?.war != null && prior?.war != null && latest.season > prior.season;

  // WAR breakdown is batter-only (pitcher WAR is FIP-based and doesn't
  // decompose into Bat/Fld/BsR) and needs the FanGraphs Value components.
  const canShowWar =
    role === "batter" && latest?.rar != null && latest?.war != null;

  // P9: batter-only deep-dive modules. The per-game log (current season only)
  // drives Recent Form, the game log, and the rolling-OPS sparkline; the batted
  // balls drive the contact-quality card. Pitchers skip all of this.
  const isBatter = role === "batter" && latest != null;
  const today = new Date().toISOString().slice(0, 10);
  const [gameLog, battedBalls, discipline, profile] = isBatter
    ? await Promise.all([
        getBatterGameLog(playerId, latest!.season),
        getBattedBalls(playerId),
        getBatterDiscipline(playerId, "jays"),
        getBattedBallProfile(playerId, "jays"),
      ])
    : [[], [], [], []];

  const last7 = summarize(windowByDays(gameLog, 7, today));
  const last30 = summarize(windowByDays(gameLog, 30, today));
  const seasonSplit = summarize(gameLog);
  const rolling = rollingOps(gameLog, 15);
  const recentGames = [...gameLog].reverse().slice(0, 10);
  // As a Blue Jay, like every other overview module (and the Hard-Hit% on the
  // batted-ball card below, which reads the same population from the 015 view).
  const evStats = computeExitVeloStats(
    battedBalls.filter(
      (e) => e.as_jay && e.game_date.slice(0, 4) === String(latest?.season),
    ),
  );

  // P10: pitcher deep-dive mirror. One per-appearance log fetch (current
  // season only, like the batter's) derives Recent Form, the rolling-ERA
  // sparkline, and the last-10 log. The year-by-year table reads the same
  // season stats already fetched above.
  const isPitcher = role === "pitcher" && latest != null;
  const [pitcherLog, pitcherDiscipline] = isPitcher
    ? await Promise.all([
        getPitcherGameLog(playerId, latest!.season),
        getPitcherDiscipline(playerId, "jays"),
      ])
    : [[], []];
  const pitcherLast5 = summarizePitching(lastNAppearances(pitcherLog, 5));
  const pitcherLast30 = summarizePitching(windowByDays(pitcherLog, 30, today));
  const pitcherSeason = summarizePitching(pitcherLog);
  const eraTrend = rollingEra(pitcherLog, 5);
  const recentApps = [...pitcherLog].reverse().slice(0, 10);

  // P12 M2: newest Jays season vs the one before it. Zone-based rates straddling
  // the 2026 zone change are shown net of the population-wide shift.
  const cardSeasonB = latest
    ? priorSeason(isPitcher ? pitcherDiscipline : discipline, latest.season)
    : null;
  const zoneRef: ZoneReference[] | undefined =
    latest && cardSeasonB != null && crossesZoneChange(latest.season, cardSeasonB)
      ? await getZoneReference()
      : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Reveal className="flex items-start gap-4">
        {player.headshot_url && (
          <Image
            src={player.headshot_url}
            alt={player.name}
            width={96}
            height={96}
            unoptimized
            className="rounded-full bg-papaya"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            {player.name}
          </h1>
          <p className="mt-0.5 text-sm text-navy/60">
            {player.position ?? "—"}
            {player.bats && player.throws && (
              <>
                {" · "}
                {t("bats")} {player.bats} / {t("throws")} {player.throws}
              </>
            )}
          </p>
        </div>
      </Reveal>

      <PlayerNav mlbamId={playerId} active="overview" available={availability} />

      {latest ? (
        <section className="mt-4 space-y-4">
          <p className="text-xs uppercase tracking-wide text-navy/55">
            {t("season")} {latest.season}
          </p>
          {availability.compare && otherClubs.length > 0 && (
            <p className="text-xs text-navy/60">
              {t("otherClubsNote", { clubs: otherClubs.join(", ") })}{" "}
              <Link
                href={`/players/${playerId}/compare`}
                className="font-semibold text-brick underline-offset-2 hover:underline"
              >
                {t("otherClubsLink")} →
              </Link>
            </p>
          )}
          <RevealGroup className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {role === "batter" ? (
              <>
                <KpiCard label="OPS" value={fmt(latest.ops, 3)} countTo={count(latest.ops, 3)} />
                <KpiCard label="wRC+" value={fmt(latest.wrc_plus, 0)} countTo={count(latest.wrc_plus, 0)} />
                <KpiCard label="WAR" value={fmt(latest.war, 1)} countTo={count(latest.war, 1)} />
              </>
            ) : (
              // P10: fan-first KPI set with plain-language hints. FIP lives in
              // the year-by-year table below; SV only shows when he has one.
              <>
                <KpiCard
                  label="W-L"
                  value={
                    latest.w == null && latest.l == null
                      ? "—"
                      : `${fmt(latest.w, 0)}-${fmt(latest.l, 0)}`
                  }
                  hint={t("kpiHintWl")}
                />
                {latest.sv != null && latest.sv > 0 && (
                  <KpiCard
                    label="SV"
                    value={fmt(latest.sv, 0)}
                    hint={t("kpiHintSv")}
                  />
                )}
                <KpiCard
                  label="IP"
                  value={latest.ip == null ? "—" : latest.ip.toFixed(1)}
                  hint={t("kpiHintIp")}
                />
                <KpiCard
                  label="ERA"
                  value={fmt(latest.era, 2)}
                  countTo={count(latest.era, 2)}
                  hint={t("kpiHintEra")}
                />
                <KpiCard
                  label="WHIP"
                  value={fmt(latest.whip, 2)}
                  countTo={count(latest.whip, 2)}
                  hint={t("kpiHintWhip")}
                />
                <KpiCard
                  label="K%"
                  value={pct1(latest.k_pct)}
                  countTo={count(latest.k_pct, 1, 100, "%")}
                  hint={t("kpiHintKPct")}
                />
                <KpiCard
                  label="WAR"
                  value={fmt(latest.war, 1)}
                  countTo={count(latest.war, 1)}
                  hint={t("kpiHintWar")}
                />
              </>
            )}
          </RevealGroup>

          {isBatter && gameLog.length > 0 && (
            <Reveal>
              <RecentForm last7={last7} last30={last30} season={seasonSplit} />
            </Reveal>
          )}

          {isBatter && (
            <Reveal>
              <RollingOpsSparkline data={rolling} />
            </Reveal>
          )}

          {isPitcher && pitcherLog.length > 0 && (
            <Reveal>
              <PitcherRecentForm
                last5={pitcherLast5}
                last30={pitcherLast30}
                season={pitcherSeason}
              />
            </Reveal>
          )}

          {isPitcher && (
            <Reveal>
              <PitcherDisciplineCard
                rows={pitcherDiscipline}
                seasonA={latest!.season}
                seasonB={cardSeasonB}
                scope="jays"
                zoneRef={zoneRef}
              />
            </Reveal>
          )}

          {isPitcher && (
            <Reveal>
              <RollingEraSparkline data={eraTrend} />
            </Reveal>
          )}

          {canShowProgress && (
            <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
              <SeasonProgressBar
                current={latest!.war!}
                prior={prior!.war!}
                priorSeason={prior!.season}
                currentSeason={latest!.season}
                role={role}
                gamesPlayed={gamesPlayed}
              />
            </Reveal>
          )}

          {isBatter && (
            <Reveal>
              <SeasonStatTable stats={stats} />
            </Reveal>
          )}

          {isPitcher && (
            <Reveal>
              <PitcherSeasonStatTable stats={stats} />
            </Reveal>
          )}

          {isBatter && (
            <Reveal>
              <ContactQualityCard stats={evStats} season={latest!.season} />
            </Reveal>
          )}

          {isBatter && (
            <Reveal>
              <DisciplineCard
                rows={discipline}
                seasonA={latest!.season}
                seasonB={cardSeasonB}
                scope="jays"
                zoneRef={zoneRef}
              />
            </Reveal>
          )}

          {isBatter && (
            <Reveal>
              <BattedBallProfileCard
                rows={profile}
                seasonA={latest!.season}
                seasonB={priorSeason(profile, latest!.season)}
                scope="jays"
              />
            </Reveal>
          )}

          {canShowWar && (
            <Reveal>
              <WarBreakdown
                batting={latest!.war_batting ?? 0}
                baserunning={latest!.war_baserunning ?? 0}
                fielding={latest!.war_fielding ?? 0}
                positional={latest!.war_positional ?? 0}
                league={latest!.war_league ?? 0}
                replacement={latest!.war_replacement ?? 0}
                rar={latest!.rar!}
                war={latest!.war!}
              />
            </Reveal>
          )}

          {isBatter && (
            <Reveal>
              <GameLog games={recentGames} />
            </Reveal>
          )}

          {isPitcher && (
            <Reveal>
              <PitcherGameLog games={recentApps} />
            </Reveal>
          )}
        </section>
      ) : (
        <p className="mt-6 text-navy/60">{t("noStats")}</p>
      )}
    </div>
  );
}
