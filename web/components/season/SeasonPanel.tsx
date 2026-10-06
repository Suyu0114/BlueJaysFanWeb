import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import ScorecardFrame from "@/components/ScorecardFrame";
import TableExport from "@/components/TableExport";
import { Reveal } from "@/components/motion/Reveal";
import type { Cell } from "@/lib/copy-table";

// One module of the season page — and of the article figures that reuse the
// season modules: the parchment `panel` frame (not clickable, so no lift), a
// Graduate heading, an optional "PNG ↓ / Copy table" action fed plain headers +
// rows (M7), and a small method note under the content.

export default async function SeasonPanel({
  seedKey,
  season,
  title,
  note,
  copy,
  children,
}: {
  seedKey: string;
  season: number;
  title: string;
  note?: ReactNode;
  copy?: { headers: Cell[]; rows: Cell[][] };
  children: ReactNode;
}) {
  const te = await getTranslations("Export");
  return (
    <Reveal>
      <ScorecardFrame seedKey={seedKey} variant="panel">
        <div className="relative z-10 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-base uppercase tracking-wide text-navy">{title}</h2>
            {copy && (
              <TableExport
                headers={copy.headers}
                rows={copy.rows}
                name={`${te("jaysSeason", { season })} ${title}`}
                caption={`${te("jaysSeason", { season })} · ${title}`}
              />
            )}
          </div>
          <div className="mt-2">{children}</div>
          {note && <p className="mt-2 text-[11px] leading-snug text-navy/55">{note}</p>}
        </div>
      </ScorecardFrame>
    </Reveal>
  );
}
