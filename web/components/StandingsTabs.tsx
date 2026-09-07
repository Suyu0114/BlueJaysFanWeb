"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ScorecardFrame from "./ScorecardFrame";

type View = "al" | "nl" | "wc";
type League = "al" | "nl";

// P11: the standings page is three views, not one long scroll — American
// League (its three divisions), National League (ditto), and a Wild Card view
// with its own AL/NL switch.
//
// Client-side rather than ?view= links, following RosterExplorer: all three
// panels are built from the SAME 30 rows the page already fetched, so a
// navigation would refetch nothing new, cost a round trip, and drop the page
// from static to dynamic rendering. The panels arrive pre-rendered on the
// server as props; this component only chooses which one is mounted.
export default function StandingsTabs({
  al,
  nl,
  wcAl,
  wcNl,
}: {
  al: React.ReactNode;
  nl: React.ReactNode;
  wcAl: React.ReactNode;
  wcNl: React.ReactNode;
}) {
  const t = useTranslations("Standings");
  const [view, setView] = useState<View>("al");
  const [league, setLeague] = useState<League>("al");

  const label: Record<View, string> = {
    al: t("americanLeague"),
    nl: t("nationalLeague"),
    wc: t("tabWildCard"),
  };

  return (
    <>
      <ScorecardFrame
        seedKey="standings-view-toggle"
        className="mt-6 w-fit text-xs"
        variant="control"
      >
        <div
          role="tablist"
          aria-label={t("viewLabel")}
          className="relative z-10 flex p-1"
        >
          {(["al", "nl", "wc"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-none px-3 py-1 font-medium transition-colors ${
                view === v
                  ? "bg-brick text-papaya"
                  : "text-navy/65 hover:text-navy"
              }`}
            >
              {label[v]}
            </button>
          ))}
        </div>
      </ScorecardFrame>

      {view === "wc" && (
        <ScorecardFrame
          seedKey="standings-wc-league-toggle"
          className="mt-4 w-fit text-xs"
          variant="control"
        >
          <div
            role="tablist"
            aria-label={t("leagueLabel")}
            className="relative z-10 flex p-1"
          >
            {/* AL / NL are baseball jargon and stay English in both locales,
                like the stat abbreviations in the tables. */}
            {(["al", "nl"] as const).map((lg) => (
              <button
                key={lg}
                type="button"
                role="tab"
                aria-selected={league === lg}
                onClick={() => setLeague(lg)}
                className={`rounded-none px-4 py-1 font-medium uppercase transition-colors ${
                  league === lg
                    ? "bg-brick text-papaya"
                    : "text-navy/65 hover:text-navy"
                }`}
              >
                {lg}
              </button>
            ))}
          </div>
        </ScorecardFrame>
      )}

      <div className="mt-6 space-y-6">
        {view === "al" && al}
        {view === "nl" && nl}
        {view === "wc" && (league === "al" ? wcAl : wcNl)}
      </div>
    </>
  );
}
