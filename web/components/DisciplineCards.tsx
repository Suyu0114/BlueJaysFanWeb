import { getTranslations } from "next-intl/server";
import SeasonCompareCard, { type CompareRow } from "@/components/SeasonCompareCard";
import type {
  BattedBallProfile,
  BatterDiscipline,
  PitcherDiscipline,
  Scope,
  ZoneReference,
} from "@/lib/discipline";
import { crossesZoneChange, referenceShift } from "@/lib/season-deltas";

// P12 M2: plate discipline + batted-ball profile, season A vs season B. The page
// picks the seasons and the scope (overview: newest vs prior Jays season, scope
// 'jays'; Compare tab: the URL's pair + scope) — these cards only render.
// Metric definitions live in db/migrations/015_metric_views.sql.

// D12 sample floors, as a Jay per season: below these a rate is noisy.
const MIN_PA = 150;
const MIN_BF = 160; // ≈ 40 IP

type Pair<T> = { a: T | undefined; b: T | undefined };

function pick<T extends { season: number }>(rows: T[], a: number, b: number | null): Pair<T> {
  return { a: rows.find((r) => r.season === a), b: b == null ? undefined : rows.find((r) => r.season === b) };
}

function pts(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v * 100).toFixed(1)}`;
}

async function common(scope: Scope) {
  const t = await getTranslations("Discipline");
  return {
    t,
    scopeLabel: scope === "jays" ? t("scopeJays") : t("scopeMlb"),
    labels: {
      metric: t("colMetric"),
      change: t("colChange"),
      changeUnit: t("unitPts"),
      smallSample: t("smallSample"),
    },
  };
}

// Zone-based rows get `shift` only when the pair straddles the 2026 zone change.
function zoneShift(
  ref: ZoneReference[] | undefined,
  key: "chase_pct" | "z_swing_pct" | "zone_pct",
  a: number,
  b: number | null,
): number | null | undefined {
  if (b == null || !ref || !crossesZoneChange(a, b)) return undefined;
  return referenceShift(ref, key, a, b);
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function zoneNote(
  t: Translator,
  ref: ZoneReference[] | undefined,
  a: number,
  b: number | null,
): string[] {
  if (b == null || !ref || !crossesZoneChange(a, b)) return [];
  const [newer, older] = a > b ? [a, b] : [b, a];
  return [
    t("zoneShiftNote", {
      newer,
      older,
      chase: pts(referenceShift(ref, "chase_pct", newer, older)),
      zone: pts(referenceShift(ref, "zone_pct", newer, older)),
    }),
  ];
}

export async function DisciplineCard({
  rows,
  seasonA,
  seasonB,
  scope,
  zoneRef,
}: {
  rows: BatterDiscipline[];
  seasonA: number;
  seasonB: number | null;
  scope: Scope;
  zoneRef?: ZoneReference[];
}) {
  const { a, b } = pick(rows, seasonA, seasonB);
  if (!a) return null;
  const { t, scopeLabel, labels } = await common(scope);
  const B = b ? seasonB : null;
  const metrics: CompareRow[] = [
    { key: "chase", label: "Chase%", hint: t("hintChase"), a: a.chase_pct, b: b?.chase_pct, format: "pct", direction: "lower", shift: zoneShift(zoneRef, "chase_pct", seasonA, B) },
    { key: "zswing", label: "Z-Swing%", hint: t("hintZSwing"), a: a.z_swing_pct, b: b?.z_swing_pct, format: "pct", direction: "neutral", shift: zoneShift(zoneRef, "z_swing_pct", seasonA, B) },
    { key: "whiff", label: "Whiff%", hint: t("hintWhiff"), a: a.whiff_pct, b: b?.whiff_pct, format: "pct", direction: "lower" },
    { key: "contact", label: "Contact%", hint: t("hintContact"), a: a.contact_pct, b: b?.contact_pct, format: "pct", direction: "higher" },
    { key: "k", label: "K%", hint: t("hintK"), a: a.k_pct, b: b?.k_pct, format: "pct", direction: "lower" },
    { key: "bb", label: "BB%", hint: t("hintBB"), a: a.bb_pct, b: b?.bb_pct, format: "pct", direction: "higher" },
    { key: "first", label: "1st-Pitch Swing%", hint: t("hintFirstSwing"), a: a.first_swing_pct, b: b?.first_swing_pct, format: "pct", direction: "neutral" },
  ];
  return (
    <SeasonCompareCard
      title={t("disciplineTitle")}
      subtitle={scopeLabel}
      seasonA={seasonA}
      seasonB={B}
      sample={{ label: "PA", a: a.pa, b: b?.pa ?? null, small: a.pa < MIN_PA || (b != null && b.pa < MIN_PA) }}
      rows={metrics}
      notes={zoneNote(t, zoneRef, seasonA, B)}
      labels={labels}
    />
  );
}

export async function BattedBallProfileCard({
  rows,
  seasonA,
  seasonB,
  scope,
}: {
  rows: BattedBallProfile[];
  seasonA: number;
  seasonB: number | null;
  scope: Scope;
}) {
  const { a, b } = pick(rows, seasonA, seasonB);
  if (!a || a.bip === 0) return null;
  const { t, scopeLabel, labels } = await common(scope);
  const B = b ? seasonB : null;
  const metrics: CompareRow[] = [
    { key: "hard", label: "Hard-Hit%", hint: t("hintHardHit"), a: a.hard_hit_pct, b: b?.hard_hit_pct, format: "pct", direction: "higher" },
    { key: "sweet", label: "Sweet-Spot%", hint: t("hintSweetSpot"), a: a.sweet_spot_pct, b: b?.sweet_spot_pct, format: "pct", direction: "higher" },
    { key: "gb", label: "GB%", hint: t("hintGb"), a: a.gb_pct, b: b?.gb_pct, format: "pct", direction: "neutral" },
    { key: "ld", label: "LD%", hint: t("hintLd"), a: a.ld_pct, b: b?.ld_pct, format: "pct", direction: "neutral" },
    { key: "fb", label: "FB%", hint: t("hintFb"), a: a.fb_pct, b: b?.fb_pct, format: "pct", direction: "neutral" },
    { key: "pu", label: "PU%", hint: t("hintPu"), a: a.pu_pct, b: b?.pu_pct, format: "pct", direction: "lower" },
    { key: "pull", label: "Pull%", hint: t("hintPull"), a: a.pull_pct, b: b?.pull_pct, format: "pct", direction: "neutral" },
    { key: "center", label: "Center%", hint: t("hintCenter"), a: a.center_pct, b: b?.center_pct, format: "pct", direction: "neutral" },
    { key: "oppo", label: "Oppo%", hint: t("hintOppo"), a: a.oppo_pct, b: b?.oppo_pct, format: "pct", direction: "neutral" },
  ];
  return (
    <SeasonCompareCard
      title={t("battedBallTitle")}
      subtitle={scopeLabel}
      seasonA={seasonA}
      seasonB={B}
      sample={{ label: t("sampleBip"), a: a.bip, b: b?.bip ?? null }}
      rows={metrics}
      notes={[t("approxNote")]}
      labels={labels}
    />
  );
}

export async function PitcherDisciplineCard({
  rows,
  seasonA,
  seasonB,
  scope,
  zoneRef,
}: {
  rows: PitcherDiscipline[];
  seasonA: number;
  seasonB: number | null;
  scope: Scope;
  zoneRef?: ZoneReference[];
}) {
  const { a, b } = pick(rows, seasonA, seasonB);
  if (!a) return null;
  const { t, scopeLabel, labels } = await common(scope);
  const B = b ? seasonB : null;
  const metrics: CompareRow[] = [
    { key: "csw", label: "CSW%", hint: t("hintCsw"), a: a.csw_pct, b: b?.csw_pct, format: "pct", direction: "higher" },
    { key: "whiff", label: "Whiff%", hint: t("hintWhiffP"), a: a.whiff_pct, b: b?.whiff_pct, format: "pct", direction: "higher" },
    { key: "chase", label: "Chase%", hint: t("hintChaseP"), a: a.chase_pct, b: b?.chase_pct, format: "pct", direction: "higher", shift: zoneShift(zoneRef, "chase_pct", seasonA, B) },
    { key: "zone", label: "Zone%", hint: t("hintZone"), a: a.zone_pct, b: b?.zone_pct, format: "pct", direction: "neutral", shift: zoneShift(zoneRef, "zone_pct", seasonA, B) },
    { key: "first", label: "1st-Pitch Strike%", hint: t("hintFirstStrike"), a: a.first_strike_pct, b: b?.first_strike_pct, format: "pct", direction: "higher" },
    { key: "kbb", label: "K-BB%", hint: t("hintKBB"), a: a.k_minus_bb_pct, b: b?.k_minus_bb_pct, format: "pct", direction: "higher" },
  ];
  return (
    <SeasonCompareCard
      title={t("pitcherTitle")}
      subtitle={scopeLabel}
      seasonA={seasonA}
      seasonB={B}
      sample={{ label: t("sampleBf"), a: a.pa, b: b?.pa ?? null, small: a.pa < MIN_BF || (b != null && b.pa < MIN_BF) }}
      rows={metrics}
      notes={zoneNote(t, zoneRef, seasonA, B)}
      labels={labels}
    />
  );
}
