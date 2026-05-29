"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import SprayChart, { type BattedBallEvent } from "@/components/charts/SprayChart";

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
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-navy/45">
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

  const [month, setMonth] = useState("all"); // "all" | "YYYY-MM"
  const [pitchTypes, setPitchTypes] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [hand, setHand] = useState<Hand>("all");

  // Distinct months and pitch types actually present in the data.
  const { months, pitchOptions } = useMemo(() => {
    const m = new Set<string>();
    const p = new Set<string>();
    for (const e of events) {
      if (e.game_date) m.add(e.game_date.slice(0, 7));
      if (e.pitch_type) p.add(e.pitch_type);
    }
    return { months: [...m].sort(), pitchOptions: [...p].sort() };
  }, [events]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
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
    [events, month, pitchTypes, outcome, hand],
  );

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
    <div className="w-full">
      <div className="mb-4 space-y-2.5">
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

      <SprayChart events={filtered} labels={labels} />
    </div>
  );
}
