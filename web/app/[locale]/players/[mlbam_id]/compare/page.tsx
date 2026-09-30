import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import PlayerNav from "@/components/PlayerNav";
import { Reveal } from "@/components/motion/Reveal";
import { TeamLogo } from "@/components/TeamLogo";
import SeasonCompareCard, { type CompareRow } from "@/components/SeasonCompareCard";
import {
  BattedBallProfileCard,
  ContactCompareCard,
  DisciplineCard,
  PitcherDisciplineCard,
} from "@/components/DisciplineCards";
import CompareControls from "@/components/compare/CompareControls";
import ClubSplits from "@/components/compare/ClubSplits";
import SeasonArc, { type ArcMetric } from "@/components/compare/SeasonArc";
import ArsenalCompareTable from "@/components/compare/ArsenalCompareTable";
import VeloCompareChart from "@/components/compare/VeloCompareChart";
import ZoneGrid from "@/components/compare/ZoneGrid";
import Exportable from "@/components/Exportable";
import SprayChart from "@/components/charts/SprayChart";
import PitchMovementChart from "@/components/charts/PitchMovementChart";
import { getPlayer, getPlayerAvailability } from "@/lib/players";
import {
  JAYS,
  SEASON_TOTAL,
  clubLabel,
  clubsBySeason,
  getTeamSeasonLines,
  type TeamSeasonLine,
} from "@/lib/compare";
import { getBattedBalls } from "@/lib/batting";
import { getPitches } from "@/lib/pitching";
import {
  getBattedBallProfile,
  getBatterDiscipline,
  getPitcherDiscipline,
  getZoneReference,
  type BattedBallProfile,
  type BatterDiscipline,
  type PitcherDiscipline,
  type Scope,
  type ZoneReference,
} from "@/lib/discipline";
import {
  biggestChanges,
  crossesZoneChange,
  formatChange,
  referenceShift,
  type ChangeCandidate,
} from "@/lib/season-deltas";
import {
  buildArsenal,
  compareArsenals,
  movementMeans,
  primaryFastball,
  veloTrend,
  zoneDistribution,
  type PitchEvent,
} from "@/lib/pitch-arsenal";
import type { BattedBallEvent } from "@/components/charts/SprayChart";

// P12 M3: season-vs-season self comparison, including time with other clubs.
// State is in the URL (?season=&vs=&scope=) so every view is an article link.
// Scope 'mlb' (default) = every club; 'jays' = only games in his Jays box score.
// Season lines: web_player_team_season_stats (team_id 0 = total, 141 = Jays).
// Statcast: the 015 views + raw rows filtered to the season and scope.

export const revalidate = 86400;

// D12 sample floors per season, in the chosen scope.
const MIN_PA = 150;
const MIN_BF = 160; // ≈ 40 IP

function pickSeason(raw: string | undefined, seasons: number[]): number | null {
  const n = Number(raw);
  return raw && seasons.includes(n) ? n : null;
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; mlbam_id: string }>;
  searchParams: Promise<{ season?: string; vs?: string; scope?: string }>;
}) {
  const { locale, mlbam_id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const playerId = Number(mlbam_id);
  if (!Number.isFinite(playerId)) notFound();

  const t = await getTranslations("Compare");
  const tb = await getTranslations("Batting");
  const tp = await getTranslations("Pitching");
  const td = await getTranslations("Discipline");

  const [player, availability, lines] = await Promise.all([
    getPlayer(playerId),
    getPlayerAvailability(playerId),
    getTeamSeasonLines(playerId),
  ]);
  if (!player) notFound();

  const seasons = [...new Set(lines.filter((l) => l.team_id === SEASON_TOTAL).map((l) => l.season))].sort(
    (a, b) => b - a,
  );

  const header = (
    <>
      <Reveal className="flex items-center gap-4">
        {player.headshot_url && (
          <Image
            src={player.headshot_url}
            alt={player.name}
            width={64}
            height={64}
            unoptimized
            className="rounded-full bg-papaya"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm text-navy/60">{player.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">{t("title")}</h1>
        </div>
      </Reveal>
      <PlayerNav mlbamId={playerId} active="compare" available={availability} />
    </>
  );

  if (seasons.length < 2) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        {header}
        <p className="mt-6 text-navy/60">{t("notEnough")}</p>
      </div>
    );
  }

  // ---- resolve the pair + scope from the URL -------------------------------
  const season = pickSeason(sp.season, seasons) ?? seasons[0];
  const vsParam = pickSeason(sp.vs, seasons);
  const vs =
    vsParam != null && vsParam !== season
      ? vsParam
      : (seasons.find((s) => s < season) ?? seasons.find((s) => s !== season)!);
  const hasJays = (s: number) => lines.some((l) => l.season === s && l.team_id === JAYS && (l.g ?? 0) > 0);
  const jaysAvailable = hasJays(season) && hasJays(vs);
  const scope: Scope = sp.scope === "jays" && jaysAvailable ? "jays" : "mlb";
  const lineFor = (s: number): TeamSeasonLine | null =>
    lines.find((l) => l.season === s && l.team_id === (scope === "jays" ? JAYS : SEASON_TOTAL)) ?? null;
  const A = lineFor(season);
  const B = lineFor(vs);

  const role: "batter" | "pitcher" =
    availability.pitching && !availability.batting
      ? "pitcher"
      : A && A.ip != null && !A.pa
        ? "pitcher"
        : "batter";

  const clubs = clubsBySeason(lines);
  const clubText = (s: number) => (scope === "jays" ? "TOR" : clubLabel(clubs[s]));
  const clubLabels = Object.fromEntries(seasons.map((s) => [s, clubLabel(clubs[s])]));
  const scopeLabel = scope === "jays" ? td("scopeJays") : td("scopeMlb");
  const pts = td("unitPts");

  // ---- Statcast (raw rows for charts; the 015 views for rates) -------------
  const inScope = (x: { game_date: string; as_jay?: boolean }, s: number) =>
    x.game_date.startsWith(String(s)) && (scope === "mlb" || x.as_jay === true);

  let events: BattedBallEvent[] = [];
  let discipline: BatterDiscipline[] = [];
  let profile: BattedBallProfile[] = [];
  let pitches: PitchEvent[] = [];
  let pDiscipline: PitcherDiscipline[] = [];
  if (role === "batter") {
    [events, discipline, profile] = await Promise.all([
      getBattedBalls(playerId),
      getBatterDiscipline(playerId, scope),
      getBattedBallProfile(playerId, scope),
    ]);
  } else {
    [pitches, pDiscipline] = await Promise.all([getPitches(playerId), getPitcherDiscipline(playerId, scope)]);
  }
  const zoneRef: ZoneReference[] | undefined = crossesZoneChange(season, vs) ? await getZoneReference() : undefined;
  const chaseShift = zoneRef ? referenceShift(zoneRef, "chase_pct", season, vs) : null;

  const discA = discipline.find((d) => d.season === season);
  const discB = discipline.find((d) => d.season === vs);
  const profA = profile.find((d) => d.season === season);
  const profB = profile.find((d) => d.season === vs);
  const pdA = pDiscipline.find((d) => d.season === season);
  const pdB = pDiscipline.find((d) => d.season === vs);
  const pitchesA = pitches.filter((p) => inScope(p, season));
  const pitchesB = pitches.filter((p) => inScope(p, vs));
  const fastball = role === "pitcher" ? primaryFastball(pitchesA) : null;
  const veloA = fastball ? veloTrend(pitchesA, fastball).map((p) => p.avgVelo) : [];
  const veloB = fastball ? veloTrend(pitchesB, fastball).map((p) => p.avgVelo) : [];

  // ---- small samples --------------------------------------------------------
  const small = (s: number, line: TeamSeasonLine | null) => {
    if (role === "batter") return (line?.pa ?? 0) < MIN_PA;
    const bf = pDiscipline.find((d) => d.season === s)?.pa ?? 0;
    return bf < MIN_BF;
  };
  const smallSeasons = [season, vs].filter((s) => small(s, s === season ? A : B));

  // ---- What changed ----------------------------------------------------------
  const candidates: ChangeCandidate[] =
    role === "batter"
      ? [
          { key: "ops", label: "OPS", a: A?.ops, b: B?.ops, format: "rate3", direction: "higher", scale: 0.04 },
          { key: "wrcPlus", label: "wRC+", a: A?.wrc_plus, b: B?.wrc_plus, format: "int", direction: "higher", scale: 12 },
          { key: "war", label: "WAR", a: A?.war, b: B?.war, format: "dec1", direction: "higher", scale: 1 },
          { key: "kPct", label: "K%", a: A?.bat_k_pct, b: B?.bat_k_pct, format: "pct", direction: "lower", scale: 0.03 },
          { key: "bbPct", label: "BB%", a: A?.bat_bb_pct, b: B?.bat_bb_pct, format: "pct", direction: "higher", scale: 0.02 },
          { key: "chase", label: "Chase%", a: discA?.chase_pct, b: discB?.chase_pct, format: "pct", direction: "lower", scale: 0.03, shift: chaseShift },
          { key: "whiff", label: "Whiff%", a: discA?.whiff_pct, b: discB?.whiff_pct, format: "pct", direction: "lower", scale: 0.03 },
          { key: "hardHit", label: "Hard-Hit%", a: profA?.hard_hit_pct, b: profB?.hard_hit_pct, format: "pct", direction: "higher", scale: 0.04 },
          { key: "avgEv", label: "Avg EV", a: profA?.avg_ev, b: profB?.avg_ev, format: "mph", direction: "higher", scale: 1 },
          { key: "sweetSpot", label: "Sweet-Spot%", a: profA?.sweet_spot_pct, b: profB?.sweet_spot_pct, format: "pct", direction: "higher", scale: 0.03 },
          { key: "xwobaCon", label: "xwOBAcon", a: profA?.xwoba_con, b: profB?.xwoba_con, format: "rate3", direction: "higher", scale: 0.025 },
        ]
      : [
          { key: "era", label: "ERA", a: A?.era, b: B?.era, format: "dec2", direction: "lower", scale: 0.6 },
          { key: "fip", label: "FIP", a: A?.fip, b: B?.fip, format: "dec2", direction: "lower", scale: 0.4 },
          { key: "whip", label: "WHIP", a: A?.whip, b: B?.whip, format: "dec2", direction: "lower", scale: 0.12 },
          { key: "pKPct", label: "K%", a: A?.k_pct, b: B?.k_pct, format: "pct", direction: "higher", scale: 0.03 },
          { key: "pBbPct", label: "BB%", a: A?.bb_pct, b: B?.bb_pct, format: "pct", direction: "lower", scale: 0.02 },
          { key: "war", label: "WAR", a: A?.war, b: B?.war, format: "dec1", direction: "higher", scale: 1 },
          { key: "csw", label: "CSW%", a: pdA?.csw_pct, b: pdB?.csw_pct, format: "pct", direction: "higher", scale: 0.02 },
          { key: "pWhiff", label: "Whiff%", a: pdA?.whiff_pct, b: pdB?.whiff_pct, format: "pct", direction: "higher", scale: 0.03 },
          { key: "pChase", label: "Chase%", a: pdA?.chase_pct, b: pdB?.chase_pct, format: "pct", direction: "higher", scale: 0.025, shift: chaseShift },
          {
            key: "fbVelo",
            label: fastball ? `${fastball} velo` : "FB velo",
            a: fastball ? buildArsenal(pitchesA).find((r) => r.pitchType === fastball)?.avgVelo : null,
            b: fastball ? buildArsenal(pitchesB).find((r) => r.pitchType === fastball)?.avgVelo : null,
            format: "mph",
            direction: "higher",
            scale: 0.8,
          },
        ];
  const changes = biggestChanges(candidates, 5);

  // ---- Season line -----------------------------------------------------------
  const kbb = (l: TeamSeasonLine | null) => (l?.k_pct != null && l.bb_pct != null ? l.k_pct - l.bb_pct : null);
  const wl = (l: TeamSeasonLine | null) => (l?.w == null && l?.l == null ? "—" : `${l?.w ?? 0}-${l?.l ?? 0}`);
  const tale: CompareRow[] =
    role === "batter"
      ? [
          { key: "g", label: "G", a: A?.g ?? null, b: B?.g, format: "int", direction: "neutral" },
          { key: "pa", label: "PA", a: A?.pa ?? null, b: B?.pa, format: "int", direction: "neutral" },
          { key: "avg", label: "AVG", a: A?.avg ?? null, b: B?.avg, format: "rate3", direction: "higher" },
          { key: "obp", label: "OBP", a: A?.obp ?? null, b: B?.obp, format: "rate3", direction: "higher" },
          { key: "slg", label: "SLG", a: A?.slg ?? null, b: B?.slg, format: "rate3", direction: "higher" },
          { key: "ops", label: "OPS", a: A?.ops ?? null, b: B?.ops, format: "rate3", direction: "higher" },
          { key: "wrc", label: "wRC+", a: A?.wrc_plus ?? null, b: B?.wrc_plus, format: "int", direction: "higher" },
          { key: "hr", label: "HR", a: A?.hr ?? null, b: B?.hr, format: "int", direction: "higher" },
          { key: "sb", label: "SB", a: A?.sb ?? null, b: B?.sb, format: "int", direction: "higher" },
          { key: "k", label: "K%", a: A?.bat_k_pct ?? null, b: B?.bat_k_pct, format: "pct", direction: "lower" },
          { key: "bb", label: "BB%", a: A?.bat_bb_pct ?? null, b: B?.bat_bb_pct, format: "pct", direction: "higher" },
          { key: "war", label: "WAR", a: A?.war ?? null, b: B?.war, format: "dec1", direction: "higher" },
        ]
      : [
          { key: "g", label: "G", a: A?.g ?? null, b: B?.g, format: "int", direction: "neutral" },
          { key: "gs", label: "GS", a: A?.gs ?? null, b: B?.gs, format: "int", direction: "neutral" },
          { key: "ip", label: "IP", a: A?.ip ?? null, b: B?.ip, format: "ip", direction: "neutral" },
          { key: "wl", label: "W-L", a: null, b: null, format: "int", direction: "neutral", text: [wl(A), wl(B)] },
          { key: "sv", label: "SV", a: A?.sv ?? null, b: B?.sv, format: "int", direction: "neutral" },
          { key: "era", label: "ERA", a: A?.era ?? null, b: B?.era, format: "dec2", direction: "lower" },
          { key: "fip", label: "FIP", a: A?.fip ?? null, b: B?.fip, format: "dec2", direction: "lower" },
          { key: "whip", label: "WHIP", a: A?.whip ?? null, b: B?.whip, format: "dec2", direction: "lower" },
          { key: "k", label: "K%", a: A?.k_pct ?? null, b: B?.k_pct, format: "pct", direction: "higher" },
          { key: "bb", label: "BB%", a: A?.bb_pct ?? null, b: B?.bb_pct, format: "pct", direction: "lower" },
          { key: "kbb", label: "K-BB%", a: kbb(A), b: kbb(B), format: "pct", direction: "higher" },
          { key: "war", label: "WAR", a: A?.war ?? null, b: B?.war, format: "dec1", direction: "higher" },
        ];

  // ---- Arc (every season on file, oldest first) ----------------------------
  const ascending = [...seasons].sort((a, b) => a - b);
  const arcPoint = (pickValue: (l: TeamSeasonLine) => number | null) =>
    ascending.map((s) => {
      const l = lineFor(s);
      return { season: s, value: l ? pickValue(l) : null, club: l ? clubText(s) : "" };
    });
  const arc: ArcMetric[] =
    role === "batter"
      ? [
          { key: "ops", label: "OPS", format: "rate3", points: arcPoint((l) => l.ops) },
          { key: "wrc", label: "wRC+", format: "int", points: arcPoint((l) => l.wrc_plus) },
          { key: "war", label: "WAR", format: "dec1", points: arcPoint((l) => l.war) },
          { key: "hr", label: "HR", format: "int", points: arcPoint((l) => l.hr) },
          { key: "k", label: "K%", format: "pct", points: arcPoint((l) => l.bat_k_pct) },
          { key: "bb", label: "BB%", format: "pct", points: arcPoint((l) => l.bat_bb_pct) },
        ]
      : [
          { key: "era", label: "ERA", format: "dec2", points: arcPoint((l) => l.era) },
          { key: "fip", label: "FIP", format: "dec2", points: arcPoint((l) => l.fip) },
          { key: "whip", label: "WHIP", format: "dec2", points: arcPoint((l) => l.whip) },
          { key: "k", label: "K%", format: "pct", points: arcPoint((l) => l.k_pct) },
          { key: "bb", label: "BB%", format: "pct", points: arcPoint((l) => l.bb_pct) },
          { key: "war", label: "WAR", format: "dec1", points: arcPoint((l) => l.war) },
        ];

  // ---- chart labels ----------------------------------------------------------
  const sprayLabels = {
    homeRun: tb("legendHomeRun"),
    extraBase: tb("legendExtraBase"),
    single: tb("legendSingle"),
    out: tb("legendOut"),
    date: tb("tipDate"),
    pitch: tb("tipPitch"),
    exitVelo: tb("tipExitVelo"),
    launchAngle: tb("tipLaunchAngle"),
  };
  const movementLabels = {
    axisHorz: tp("axisHorzBreak"),
    axisVert: tp("axisVertBreak"),
    pitches: tp("colCount"),
    avgVelo: tp("colAvgVelo"),
  };
  const cardLabels = { metric: td("colMetric"), change: td("colChange"), ptsSuffix: ` ${pts}`, smallSample: td("smallSample") };

  const seasonBadge = (s: number, l: TeamSeasonLine | null, tone: "brick" | "steel") => (
    <div className="flex items-center gap-2 rounded-md border border-steel/20 bg-white/50 px-3 py-2">
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone === "brick" ? "bg-brick" : "bg-steel"}`} aria-hidden />
      <span className="font-display text-lg uppercase text-navy">{s}</span>
      <span className="flex items-center gap-1">
        {(scope === "jays" ? [JAYS] : (clubs[s] ?? [])).map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            {i > 0 && <span className="text-navy/40">→</span>}
            <TeamLogo teamId={id} teamName={clubLabel([id])} size={22} />
          </span>
        ))}
      </span>
      <span className="text-xs text-navy/55">
        {role === "batter"
          ? t("summaryBatter", { g: l?.g ?? 0, pa: l?.pa ?? 0 })
          : t("summaryPitcher", { g: l?.g ?? 0, ip: l?.ip?.toFixed(1) ?? "0.0" })}
      </span>
      {small(s, l) && (
        <span className="rounded bg-dirt/40 px-1 py-px text-[10px] text-navy/70">{td("smallSample")}</span>
      )}
    </div>
  );

  const sprayA = events.filter((e) => inScope(e, season));
  const sprayB = events.filter((e) => inScope(e, vs));
  const zoneA = zoneDistribution(pitchesA);
  const zoneB = zoneDistribution(pitchesB);
  const zoneMax = Math.max(0, ...Object.values(zoneA.share), ...Object.values(zoneB.share));

  const directionBars = (p: BattedBallProfile | undefined) =>
    p && p.pull_pct != null ? (
      <div className="mt-2 w-full max-w-sm">
        <div className="flex h-2 overflow-hidden rounded-full bg-navy/5">
          <span className="bg-navy" style={{ width: `${(p.pull_pct ?? 0) * 100}%` }} />
          <span className="bg-steel" style={{ width: `${(p.center_pct ?? 0) * 100}%` }} />
          <span className="bg-lava/70" style={{ width: `${(p.oppo_pct ?? 0) * 100}%` }} />
        </div>
        <p className="mt-1 text-[11px] tabular-nums text-navy/60">
          Pull {Math.round((p.pull_pct ?? 0) * 100)}% · Center {Math.round((p.center_pct ?? 0) * 100)}% · Oppo{" "}
          {Math.round((p.oppo_pct ?? 0) * 100)}%
        </p>
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {header}

      <section className="mt-4 space-y-4">
        <Reveal>
          <CompareControls
            mlbamId={playerId}
            seasons={seasons}
            season={season}
            vs={vs}
            scope={scope}
            jaysAvailable={jaysAvailable}
            clubLabels={clubLabels}
            labels={{
              season: t("controlSeason"),
              vs: t("controlVs"),
              scope: t("controlScope"),
              mlb: t("scopeMlb"),
              jays: t("scopeJays"),
              jaysDisabled: t("jaysDisabled"),
            }}
          />
        </Reveal>

        <Reveal className="grid gap-2 sm:grid-cols-2">
          {seasonBadge(season, A, "brick")}
          {seasonBadge(vs, B, "steel")}
        </Reveal>

        {/* What changed */}
        <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
          <h2 className="text-sm font-semibold text-navy">
            {t("changedTitle")} <span className="font-normal text-navy/45">· {season} vs {vs}</span>
          </h2>
          {changes.length === 0 ? (
            <p className="mt-2 text-sm text-navy/70">{t("noBigChanges")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {changes.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm text-navy">
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${c.tone === "better" ? "bg-grass" : "bg-brick"}`}
                    aria-hidden
                  />
                  <span>
                    {t("changeLine", {
                      stat: c.shift != null ? `${c.label}†` : c.label,
                      dir: c.delta > 0 ? t("up") : t("down"),
                      amount: formatChange(c.delta, c.format, pts),
                      meaning: t(`meaning.${c.key}.${c.tone === "better" ? "better" : "worse"}`),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {smallSeasons.length > 0 && (
            <p className="mt-2 text-[11px] text-navy/50">{t("smallSampleNote", { seasons: smallSeasons.join(", ") })}</p>
          )}
          {changes.some((c) => c.shift != null) && (
            <p className="mt-1 text-[11px] text-navy/50">{t("zoneShiftShort")}</p>
          )}
        </Reveal>

        {/* Season line + clubs */}
        <Reveal>
          <SeasonCompareCard
            title={t("taleTitle")}
            subtitle={scopeLabel}
            seasonA={season}
            seasonB={vs}
            rows={tale}
            labels={cardLabels}
          />
        </Reveal>
        {scope === "mlb" && (
          <Reveal>
            <ClubSplits
              lines={lines}
              seasonA={season}
              seasonB={vs}
              role={role}
              locale={locale}
              labels={{ title: t("clubsTitle"), club: t("colClub"), span: t("colSpan") }}
            />
          </Reveal>
        )}

        {/* Arc */}
        <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
          <h2 className="text-sm font-semibold text-navy">
            {t("arcTitle", { from: ascending[0], to: ascending[ascending.length - 1] })}{" "}
            <span className="font-normal text-navy/45">· {scopeLabel}</span>
          </h2>
          <div className="mt-3">
            <SeasonArc metrics={arc} seasonA={season} seasonB={vs} />
          </div>
        </Reveal>

        {/* Statcast */}
        <Reveal>
          <h2 className="mt-2 font-display text-lg uppercase tracking-wide text-navy">{t("statcastTitle")}</h2>
          <p className="text-xs text-navy/55">{t("statcastSubtitle")}</p>
        </Reveal>

        {role === "batter" ? (
          <>
            <Reveal>
              <DisciplineCard rows={discipline} seasonA={season} seasonB={vs} scope={scope} zoneRef={zoneRef} />
            </Reveal>
            <Reveal>
              <ContactCompareCard rows={profile} seasonA={season} seasonB={vs} scope={scope} />
            </Reveal>
            <Reveal>
              <BattedBallProfileCard rows={profile} seasonA={season} seasonB={vs} scope={scope} />
            </Reveal>
            <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
              <h3 className="text-sm font-semibold text-navy">{t("sprayTitle")}</h3>
              <div className="mt-3 grid gap-6 md:grid-cols-2">
                {[
                  { s: season, ev: sprayA, prof: profA, tone: "bg-brick" },
                  { s: vs, ev: sprayB, prof: profB, tone: "bg-steel" },
                ].map((x) => (
                  <figure key={x.s} className="flex flex-col items-center">
                    <figcaption className="mb-1 flex items-center gap-1.5 self-start text-xs text-navy/60">
                      <span className={`inline-block h-2 w-2 rounded-full ${x.tone}`} aria-hidden />
                      <span className="font-semibold text-navy">{x.s}</span>
                      <span>· {clubText(x.s)} · {t("sprayCaption", { n: x.ev.length })}</span>
                    </figcaption>
                    {x.ev.length > 0 ? (
                      <Exportable
                        name={`${player.name} spray ${x.s} ${scope}`}
                        caption={`${player.name} · ${t("sprayTitle")} · ${x.s} (${clubText(x.s)})`}
                        className="w-full"
                      >
                        <SprayChart events={x.ev} labels={sprayLabels} width={420} />
                      </Exportable>
                    ) : (
                      <p className="py-8 text-sm text-navy/50">{t("noStatcast")}</p>
                    )}
                    {directionBars(x.prof)}
                  </figure>
                ))}
              </div>
            </Reveal>
          </>
        ) : (
          <>
            <Reveal>
              <PitcherDisciplineCard rows={pDiscipline} seasonA={season} seasonB={vs} scope={scope} zoneRef={zoneRef} />
            </Reveal>
            <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-navy">
                {t("arsenalTitle")} <span className="font-normal text-navy/45">· {scopeLabel}</span>
              </h3>
              {pitchesA.length + pitchesB.length === 0 ? (
                <p className="text-sm text-navy/50">{t("noStatcast")}</p>
              ) : (
                <ArsenalCompareTable
                  rows={compareArsenals(buildArsenal(pitchesA), buildArsenal(pitchesB))}
                  seasonA={season}
                  seasonB={vs}
                  labels={{
                    pitch: t("colPitch"),
                    usage: tp("colUsage"),
                    velo: tp("colAvgVelo"),
                    veloChange: t("colVeloChange"),
                    spin: tp("colSpin"),
                    whiff: tp("colWhiff"),
                    xwobaCon: tp("colXwobaCon"),
                    new: t("badgeNew"),
                    dropped: t("badgeDropped"),
                  }}
                />
              )}
              <p className="mt-2 text-[11px] text-navy/50">{t("arsenalNote")}</p>
            </Reveal>
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
              <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy">{t("movementTitle")}</h3>
                {pitchesA.length > 0 ? (
                  <Exportable
                    name={`${player.name} movement ${season} vs ${vs}`}
                    caption={`${player.name} · ${t("movementTitle")} · ${season} (rings: ${vs})`}
                  >
                    <PitchMovementChart pitches={pitchesA} labels={movementLabels} ghostMeans={movementMeans(pitchesB)} />
                  </Exportable>
                ) : (
                  <p className="text-sm text-navy/50">{t("noStatcast")}</p>
                )}
                <p className="mt-1 text-[11px] text-navy/50">{t("movementNote", { a: season, b: vs })}</p>
              </Reveal>
              <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4" delay={0.12}>
                <h3 className="mb-2 text-sm font-semibold text-navy">{t("zoneTitle")}</h3>
                <div className="flex flex-wrap justify-center gap-4">
                  <Exportable name={`${player.name} zone ${season}`} caption={`${player.name} · ${t("zoneTitle")} · ${season}`}>
                    <ZoneGrid dist={zoneA} maxShare={zoneMax} season={season} tone="brick" caption={t("pitchCount", { n: zoneA.total })} />
                  </Exportable>
                  <Exportable name={`${player.name} zone ${vs}`} caption={`${player.name} · ${t("zoneTitle")} · ${vs}`}>
                    <ZoneGrid dist={zoneB} maxShare={zoneMax} season={vs} tone="steel" caption={t("pitchCount", { n: zoneB.total })} />
                  </Exportable>
                </div>
                <p className="mt-2 max-w-[360px] text-[11px] text-navy/50">
                  {t("zoneNote")} {crossesZoneChange(season, vs) && t("zoneShiftGrid")}
                </p>
              </Reveal>
            </div>
            {fastball && veloA.length >= 3 && (
              <Reveal className="rounded-lg border border-navy/10 bg-white/50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-navy">
                  {t("veloTitle")} · {fastball}
                </h3>
                <Exportable
                  name={`${player.name} velo ${fastball} ${season} vs ${vs}`}
                  caption={`${player.name} · ${t("veloTitle")} · ${fastball} · ${season} vs ${vs}`}
                >
                  <VeloCompareChart a={veloA} b={veloB} seasonA={season} seasonB={vs} labels={{ appearance: t("appearance") }} />
                </Exportable>
                <p className="mt-1 text-[11px] text-navy/50">{t("veloNote", { a: season, b: vs })}</p>
              </Reveal>
            )}
          </>
        )}
      </section>
    </div>
  );
}
