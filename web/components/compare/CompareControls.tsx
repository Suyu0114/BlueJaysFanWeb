import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import type { Scope } from "@/lib/discipline";

// P12 M3: the Compare tab's state lives in the URL (?season=&vs=&scope=), so
// every view is a shareable article link and works without JS. Each option is a
// Link; the active one carries the shared-layout SlidingPill, like the roster's
// Current / All toggle. Picking the season that is currently "vs" swaps the two.

type Option = { key: string; label: string; sub?: string; href: string | null; active: boolean; title?: string };

function Group({ id, label, options }: { id: string; label: string; options: Option[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-navy/45">
        {label}
      </span>
      <ScorecardFrame seedKey={`compare-${id}`} variant="control" className="text-xs">
        <div role="tablist" aria-label={label} className="relative z-10 flex flex-wrap p-1">
          {options.map((o) => {
            const inner = (
              <>
                {o.active && <SlidingPill group={`compare-${id}`} />}
                <span className="relative z-10">
                  {o.label}
                  {o.sub && <span className={`ml-1 ${o.active ? "text-papaya/75" : "text-navy/45"}`}>{o.sub}</span>}
                </span>
              </>
            );
            const cls = `relative px-3 py-1 font-medium transition-colors ${
              o.active ? "text-papaya" : o.href ? "text-navy/65 hover:text-navy" : "cursor-not-allowed text-navy/30"
            }`;
            return o.href && !o.active ? (
              <Link key={o.key} href={o.href} scroll={false} role="tab" aria-selected={false} className={cls}>
                {inner}
              </Link>
            ) : (
              <span key={o.key} role="tab" aria-selected={o.active} aria-disabled={!o.href || undefined} title={o.title} className={cls}>
                {inner}
              </span>
            );
          })}
        </div>
      </ScorecardFrame>
    </div>
  );
}

export default function CompareControls({
  mlbamId,
  seasons,
  season,
  vs,
  scope,
  jaysAvailable,
  clubLabels,
  labels,
}: {
  mlbamId: number;
  seasons: number[]; // newest first
  season: number;
  vs: number;
  scope: Scope;
  jaysAvailable: boolean;
  clubLabels: Record<number, string>;
  labels: { season: string; vs: string; scope: string; mlb: string; jays: string; jaysDisabled: string };
}) {
  const href = (s: number, v: number, sc: Scope) =>
    `/players/${mlbamId}/compare?season=${s}&vs=${v}&scope=${sc}`;
  // Switching seasons keeps the scope only if it is still valid for the new pair;
  // the page falls back to "mlb" otherwise, so passing it through is safe.
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      <Group
        id="season"
        label={labels.season}
        options={seasons.map((s) => ({
          key: String(s),
          label: String(s),
          sub: clubLabels[s],
          href: href(s, s === vs ? season : vs, scope),
          active: s === season,
        }))}
      />
      <Group
        id="vs"
        label={labels.vs}
        options={seasons
          .filter((s) => s !== season)
          .map((s) => ({
            key: String(s),
            label: String(s),
            sub: clubLabels[s],
            href: href(season, s, scope),
            active: s === vs,
          }))}
      />
      <Group
        id="scope"
        label={labels.scope}
        options={[
          { key: "mlb", label: labels.mlb, href: href(season, vs, "mlb"), active: scope === "mlb" },
          {
            key: "jays",
            label: labels.jays,
            href: jaysAvailable ? href(season, vs, "jays") : null,
            active: scope === "jays",
            title: jaysAvailable ? undefined : labels.jaysDisabled,
          },
        ]}
      />
    </div>
  );
}
