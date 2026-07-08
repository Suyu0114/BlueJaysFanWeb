"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import SprayChart, { type BattedBallEvent } from "@/components/charts/SprayChart";
import ExitVeloChart from "@/components/charts/ExitVeloChart";
import { computeExitVeloStats } from "@/lib/exit-velo-stats";

type Outcome = "all" | "hit" | "xbh" | "hr";
type Hand = "all" | "L" | "R";

function matchesOutcome(event: string | null, outcome: Outcome): boolean {
  switch (outcome) {
    case "hit":
      return (
        event === "single" ||
        event === "double" ||
        event === "triple" ||
        event === "home_run"
      );
    case "xbh":
      return event === "double" || event === "triple" || event === "home_run";
    case "hr":
      return event === "home_run";
    default:
      return true;
  }
}

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

// Client wrapper: holds filter state, renders the filter bar, and feeds the
// filtered events into the framework-pure SprayChart. The chart never sees
// next-intl; all i18n lives here.
export default function SprayChartExplorer({
  events,
}: {
  events: BattedBallEvent[];
}) {
  const t = useTranslations("Batting");
  const locale = useLocale();

  const [season, setSeason] = useState("all"); // "all" | "YYYY"
  const [month, setMonth] = useState("all"); // "all" | "YYYY-MM"
  const [pitchTypes, setPitchTypes] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [hand, setHand] = useState<Hand>("all");

  // Changing season resets the month (months cascade off the selected season).
  const handleSeasonChange = (s: string) => {
    setSeason(s);
    setMonth("all");
  };

  // Distinct seasons present in the data, newest first.
  const seasons = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) if (e.game_date) s.add(e.game_date.slice(0, 4));
    return [...s].sort().reverse();
  }, [events]);

  // Distinct months and pitch types actually present in the data, scoped to the
  // selected season so the month chips don't show duplicate Mar/Apr/... .
  const { months, pitchOptions } = useMemo(() => {
    const pool =
      season === "all"
        ? events
        : events.filter((e) => e.game_date.slice(0, 4) === season);
    const m = new Set<string>();
    const p = new Set<string>();
    for (const e of pool) {
      if (e.game_date) m.add(e.game_date.slice(0, 7));
      if (e.pitch_type) p.add(e.pitch_type);
    }
    return { months: [...m].sort(), pitchOptions: [...p].sort() };
  }, [events, season]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (season !== "all" && e.game_date.slice(0, 4) !== season) return false;
        if (month !== "all" && e.game_date.slice(0, 7) !== month) return false;
        if (
          pitchTypes.size > 0 &&
          (!e.pitch_type || !pitchTypes.has(e.pitch_type))
        )
          return false;
        if (outcome !== "all" && !matchesOutcome(e.event, outcome)) return false;
        if (hand !== "all" && e.p_throws !== hand) return false;
        return true;
      }),
    [events, season, month, pitchTypes, outcome, hand],
  );

  const evStats = useMemo(() => computeExitVeloStats(filtered), [filtered]);

  const labels = {
    homeRun: t("legendHomeRun"),
    extraBase: t("legendExtraBase"),
    single: t("legendSingle"),
    out: t("legendOut"),
    date: t("tipDate"),
    pitch: t("tipPitch"),
    exitVelo: t("tipExitVelo"),
    launchAngle: t("tipLaunchAngle"),
  };

  const evLabels = {
    ...labels,
    axisEV: t("axisEV"),
    axisLA: t("axisLA"),
    barrelZone: t("barrelZone"),
  };

  const fmt1 = (n: number | null) => (n == null ? "—" : n.toFixed(1));
  const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

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
        {seasons.length > 1 && (
          <FilterGroup label={t("filterSeason")}>
            <Chip
              active={season === "all"}
              onClick={() => handleSeasonChange("all")}
            >
              {t("filterAll")}
            </Chip>
            {seasons.map((s) => (
              <Chip
                key={s}
                active={season === s}
                onClick={() => handleSeasonChange(s)}
              >
                {s}
              </Chip>
            ))}
          </FilterGroup>
        )}

        {season !== "all" && (
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
        )}

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

        <FilterGroup label={t("filterOutcome")}>
          <Chip active={outcome === "all"} onClick={() => setOutcome("all")}>
            {t("filterAll")}
          </Chip>
          <Chip active={outcome === "hit"} onClick={() => setOutcome("hit")}>
            Hit
          </Chip>
          <Chip active={outcome === "xbh"} onClick={() => setOutcome("xbh")}>
            XBH
          </Chip>
          <Chip active={outcome === "hr"} onClick={() => setOutcome("hr")}>
            HR
          </Chip>
        </FilterGroup>

        <FilterGroup label={t("filterPitcherHand")}>
          <Chip active={hand === "all"} onClick={() => setHand("all")}>
            {t("filterAll")}
          </Chip>
          <Chip active={hand === "L"} onClick={() => setHand("L")}>
            vs LHP
          </Chip>
          <Chip active={hand === "R"} onClick={() => setHand("R")}>
            vs RHP
          </Chip>
        </FilterGroup>

        <p className="text-xs text-navy/50">
          {t("showing", { shown: filtered.length, total: events.length })}
        </p>
      </div>

      <div className="mx-auto h-[60vh] max-h-[560px] min-h-[320px] w-full max-w-xl">
        <SprayChart events={filtered} labels={labels} />
      </div>

      <section className="border-t border-navy/10 pt-4">
        <h2 className="text-lg font-semibold tracking-tight text-navy">
          {t("exitVeloTitle")}
        </h2>

        <div className="mt-2 flex flex-wrap gap-2">
          <Kpi label={t("avgEV")} value={fmt1(evStats.avgEV)} unit="mph" />
          <Kpi label={t("maxEV")} value={fmt1(evStats.maxEV)} unit="mph" />
          <Kpi label={t("hardHitPct")} value={fmtPct(evStats.hardHitPct)} />
        </div>

        <p className="mt-2 text-xs text-navy/50">
          {t("evSubtitle", {
            total: evStats.totalBattedBalls,
            withEV: evStats.withEV,
          })}
        </p>

        <div className="mt-3">
          <ExitVeloChart events={filtered} labels={evLabels} />
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-steel/30 bg-white/40 px-3 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">
        {label}
      </div>
      <div className="text-base font-semibold text-navy">
        {value}
        {unit && value !== "—" && (
          <span className="ml-1 text-xs font-normal text-navy/50">{unit}</span>
        )}
      </div>
    </div>
  );
}
