"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import ArsenalTable from "@/components/charts/ArsenalTable";
import PitchMovementChart from "@/components/charts/PitchMovementChart";
import PitchZoneHeatmap from "@/components/charts/PitchZoneHeatmap";
import VeloTrendChart from "@/components/charts/VeloTrendChart";
import {
  primaryFastball,
  veloTrend,
  type PitchEvent,
} from "@/lib/pitch-arsenal";

type BatterHand = "all" | "L" | "R";

// Velocity trend needs a real line before it means anything.
const VELO_TREND_MIN_GAMES = 5;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
        active
          ? "border-navy bg-navy text-papaya"
          : "border-steel/40 text-navy/70 hover:border-steel hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-navy/45">
        {label}
      </span>
      {children}
    </div>
  );
}

// Client wrapper: holds filter state, feeds filtered pitches to the pure
// chart components (ArsenalTable / PitchMovementChart / PitchZoneHeatmap /
// VeloTrendChart). The pure components never see next-intl; all i18n lives
// here. P10 layout: arsenal (the "what does he throw and how good is it"
// anchor) -> movement + location -> fastball velocity trend, each with a
// plain-language story caption.
export default function PitchingExplorer({
  pitches,
}: {
  pitches: PitchEvent[];
}) {
  const t = useTranslations("Pitching");
  const locale = useLocale();

  const [month, setMonth] = useState("all"); // "all" | "YYYY-MM"
  const [pitchTypes, setPitchTypes] = useState<Set<string>>(new Set());
  const [batterHand, setBatterHand] = useState<BatterHand>("all");
  const [zoneAlignment, setZoneAlignment] = useState<string | null>(null);

  const { months, pitchOptions } = useMemo(() => {
    const m = new Set<string>();
    const p = new Set<string>();
    for (const e of pitches) {
      if (e.game_date) m.add(e.game_date.slice(0, 7));
      if (e.pitch_type) p.add(e.pitch_type);
    }
    return { months: [...m].sort(), pitchOptions: [...p].sort() };
  }, [pitches]);

  const filtered = useMemo(
    () =>
      pitches.filter((p) => {
        if (month !== "all" && p.game_date.slice(0, 7) !== month) return false;
        if (
          pitchTypes.size > 0 &&
          (!p.pitch_type || !pitchTypes.has(p.pitch_type))
        )
          return false;
        if (batterHand !== "all" && p.stand !== batterHand) return false;
        return true;
      }),
    [pitches, month, pitchTypes, batterHand],
  );

  // The location heatmap reads plate_x/plate_z, which changed reference frame in
  // 2026 ('front' <=2025 -> 'middle' >=2026). Feed it a SINGLE alignment so the
  // zone doesn't smear by 1-3 inches; the arsenal table and movement chart are
  // alignment-agnostic (release-frame fields only) and keep every row. See
  // docs/DATA_MODEL.md (plate_alignment invariant).
  const zoneAlignments = useMemo(() => {
    const present = new Set<string>();
    for (const p of filtered) if (p.plate_alignment) present.add(p.plate_alignment);
    // newest era first: 'middle' (2026+) before 'front' (<=2025)
    return [...present].sort((a, b) => (a === b ? 0 : a === "middle" ? -1 : 1));
  }, [filtered]);

  const activeAlignment =
    zoneAlignment && zoneAlignments.includes(zoneAlignment)
      ? zoneAlignment
      : (zoneAlignments[0] ?? null);

  const zonePitches = useMemo(
    () =>
      activeAlignment
        ? filtered.filter((p) => p.plate_alignment === activeAlignment)
        : filtered,
    [filtered, activeAlignment],
  );

  // Velocity trend: computed from the FULL pitch set (not the filters) so the
  // line stays a stable season-long story; veloTrend() scopes to the latest
  // season internally.
  const { trendPitch, trendPoints } = useMemo(() => {
    const trendPitch = primaryFastball(pitches);
    return {
      trendPitch,
      trendPoints: trendPitch ? veloTrend(pitches, trendPitch) : [],
    };
  }, [pitches]);

  const alignLabel = (a: string) =>
    a === "middle" ? t("alignMiddle") : t("alignFront");

  const arsenalLabels = {
    usage: t("colUsage"),
    pitches: t("colCount"),
    avgVelo: t("colAvgVelo"),
    spin: t("colSpin"),
    whiff: t("colWhiff"),
    xwobaCon: t("colXwobaCon"),
  };
  const movementLabels = {
    axisHorz: t("axisHorzBreak"),
    axisVert: t("axisVertBreak"),
    pitches: t("colCount"),
    avgVelo: t("colAvgVelo"),
  };
  const zoneLabels = {
    legendLow: t("heatmapLow"),
    legendHigh: t("heatmapHigh"),
  };

  const monthFmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const monthLabel = (ym: string) => {
    const [y, mo] = ym.split("-").map(Number);
    return monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)));
  };

  const togglePitch = (pt: string) =>
    setPitchTypes((prev) => {
      const next = new Set(prev);
      if (next.has(pt)) next.delete(pt);
      else next.add(pt);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <FilterGroup label={t("filterMonth")}>
          <Chip active={month === "all"} onClick={() => setMonth("all")}>
            {t("filterFullSeason")}
          </Chip>
          {months.map((m) => (
            <Chip key={m} active={month === m} onClick={() => setMonth(m)}>
              {monthLabel(m)}
            </Chip>
          ))}
        </FilterGroup>

        {pitchOptions.length > 0 && (
          <FilterGroup label={t("filterPitchType")}>
            {pitchOptions.map((pt) => (
              <Chip
                key={pt}
                active={pitchTypes.has(pt)}
                onClick={() => togglePitch(pt)}
              >
                {pt}
              </Chip>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label={t("filterBatterHand")}>
          <Chip
            active={batterHand === "all"}
            onClick={() => setBatterHand("all")}
          >
            {t("filterAll")}
          </Chip>
          <Chip
            active={batterHand === "L"}
            onClick={() => setBatterHand("L")}
          >
            vs LHH
          </Chip>
          <Chip
            active={batterHand === "R"}
            onClick={() => setBatterHand("R")}
          >
            vs RHH
          </Chip>
        </FilterGroup>

        <p className="text-xs text-navy/50">
          {t("showing", { shown: filtered.length, total: pitches.length })}
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-navy">
          {t("arsenalTitle")}
        </h2>
        <ArsenalTable pitches={filtered} labels={arsenalLabels} />
        <p className="mt-2 text-xs text-navy/50">{t("arsenalStory")}</p>
        <p className="mt-0.5 text-xs text-navy/40">{t("xwobaConNote")}</p>
      </section>

      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy">
            {t("movementTitle")}
          </h2>
          <PitchMovementChart pitches={filtered} labels={movementLabels} />
          <p className="mt-1 text-xs text-navy/50">{t("movementStory")}</p>
          <p className="mt-0.5 text-xs text-navy/40">{t("pitcherViewNote")}</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy">
            {t("locationTitle")}
          </h2>
          {zoneAlignments.length > 1 && (
            <div className="mb-2 space-y-1">
              <FilterGroup label={t("zoneFrame")}>
                {zoneAlignments.map((a) => (
                  <Chip
                    key={a}
                    active={activeAlignment === a}
                    onClick={() => setZoneAlignment(a)}
                  >
                    {alignLabel(a)}
                  </Chip>
                ))}
              </FilterGroup>
              <p className="text-[11px] text-navy/45">{t("zoneEraNote")}</p>
            </div>
          )}
          <PitchZoneHeatmap pitches={zonePitches} labels={zoneLabels} />
          {activeAlignment && (
            <p className="mt-1 text-center text-[11px] text-navy/50">
              {t("zoneShowing", {
                n: zonePitches.length,
                era: alignLabel(activeAlignment),
              })}
            </p>
          )}
          <p className="mt-1 max-w-[280px] text-xs text-navy/50">
            {t("locationStory")}
          </p>
        </section>
      </div>

      {trendPitch && trendPoints.length >= VELO_TREND_MIN_GAMES && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy">
            {t("veloTrendTitle")} · {trendPitch}
          </h2>
          <VeloTrendChart data={trendPoints} pitchType={trendPitch} />
          <p className="mt-1 text-xs text-navy/50">{t("veloTrendStory")}</p>
        </section>
      )}
    </div>
  );
}
