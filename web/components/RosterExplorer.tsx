"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import { DUR, EASE_SOFT, SPRING_SOFT, STAGGER } from "@/lib/motion";
import type { RosterMode, RosterPlayer } from "@/lib/players";

type FilterKind = "all" | "pitchers" | "batters";
const FILTERS: FilterKind[] = ["all", "pitchers", "batters"];

// web_players.position stores pitchers as "P" (confirmed); everyone else
// (position players + DH) is treated as a batter.
function isPitcher(p: RosterPlayer): boolean {
  return (p.position ?? "").toUpperCase() === "P";
}

export default function RosterExplorer({
  players,
  mode,
}: {
  players: RosterPlayer[];
  mode: RosterMode;
}) {
  const t = useTranslations("Roster");
  const [filter, setFilter] = useState<FilterKind>("all");

  const filtered = useMemo(
    () =>
      players.filter((p) =>
        filter === "pitchers" ? isPitcher(p) : filter === "batters" ? !isPitcher(p) : true,
      ),
    [players, filter],
  );

  return (
    <div>
      <ScorecardFrame
        seedKey="roster-filter-toggle"
        variant="control"
        className="mt-6 w-fit text-xs"
      >
        <div
          role="tablist"
          aria-label={t("filterLabel")}
          className="relative z-10 flex p-1"
        >
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={`relative rounded-none px-3 py-1 font-medium transition-colors ${
                  active ? "text-papaya" : "text-navy/65 hover:text-navy"
                }`}
              >
                {active && <SlidingPill group="roster-filter" />}
                <span className="relative z-10">
                  {t(
                    f === "all"
                      ? "filterAll"
                      : f === "pitchers"
                        ? "filterPitchers"
                        : "filterBatters",
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </ScorecardFrame>

      {filtered.length === 0 ? (
        <p className="mt-8 text-navy/55">{t("emptyFilter")}</p>
      ) : mode === "all-time" ? (
        <GroupedGrid players={filtered} t={t} />
      ) : (
        <div className="mt-8">
          <CardGrid players={filtered} t={t} />
        </div>
      )}
    </div>
  );
}

// All-time view: current 26-man players first ("Still on the roster"), then
// departed players grouped by their most-recent Jays season (desc), so being on
// the roster vs. having played in a given year stay clearly separate. `players`
// arrives already sorted (active first, then last_season desc, then name).
function GroupedGrid({
  players,
  t,
}: {
  players: RosterPlayer[];
  t: ReturnType<typeof useTranslations>;
}) {
  const { active, pastGroups, pastSeasons } = useMemo(() => {
    const active: RosterPlayer[] = [];
    const m = new Map<number, RosterPlayer[]>();
    for (const p of players) {
      if (p.is_active_26) {
        active.push(p);
        continue;
      }
      const s = p.last_season ?? 0;
      const arr = m.get(s);
      if (arr) arr.push(p);
      else m.set(s, [p]);
    }
    return {
      active,
      pastGroups: m,
      pastSeasons: [...m.keys()].sort((a, b) => b - a),
    };
  }, [players]);

  return (
    <div className="mt-8 space-y-8">
      {active.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-navy/70">
            {t("sectionActive")}
          </h2>
          <CardGrid players={active} t={t} />
        </section>
      )}
      {pastSeasons.map((s) => (
        <section key={s}>
          <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-navy/70">
            {t("sectionPast", { season: String(s) })}
          </h2>
          <CardGrid players={pastGroups.get(s)!} t={t} />
        </section>
      ))}
    </div>
  );
}

function CardGrid({
  players,
  t,
}: {
  players: RosterPlayer[];
  t: ReturnType<typeof useTranslations>;
}) {
  // Each card reveals as it scrolls in (staggered across its row, so a long
  // all-time list fills in as you scroll rather than all at once). On a filter
  // change, `layout` slides the surviving cards to their new grid slots while
  // popLayout lets the filtered-out ones shrink away without holding space.
  return (
    <ul className="relative grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <AnimatePresence mode="popLayout">
        {players.map((p, i) => (
          <motion.li
            key={p.mlbam_id}
            data-reveal
            layout
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: DUR.exit, ease: EASE_SOFT } }}
            transition={{
              layout: SPRING_SOFT,
              default: { duration: DUR.enter, ease: EASE_SOFT, delay: (i % 4) * STAGGER },
            }}
          >
            <ScorecardFrame seedKey={String(p.mlbam_id)} className="h-full">
              <Link
                href={`/players/${p.mlbam_id}`}
                className="relative z-10 block h-full p-4"
              >
                {p.headshot_url && (
                  <Image
                    src={p.headshot_url}
                    alt={p.name}
                    width={120}
                    height={120}
                    unoptimized
                    className="mx-auto rounded-full bg-papaya ring-1 ring-navy/15 transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-105"
                  />
                )}
                <div className="mt-3 text-center">
                  <div className="font-medium text-navy">{p.name}</div>
                  <div className="mt-1 text-xs text-navy/60">
                    {p.position}
                    {p.bats && p.throws && (
                      <>
                        {" · "}
                        {t("bats")} {p.bats} / {t("throws")} {p.throws}
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </ScorecardFrame>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
