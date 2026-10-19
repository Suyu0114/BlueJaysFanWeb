import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import TableExport from "@/components/TableExport";
import { Reveal } from "@/components/motion/Reveal";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import { rightAlignedColumns } from "@/lib/table-align";

// An article's own data table, for numbers the site has no module for (free
// agents, prospects, NPB lines): written into the MDX as headers + rows, so
// they are static and dated by the registry's dataAsOf — and not checked
// against the DB, unlike the live figures. Same look as every stat table on the
// site (panel frame, navy header bar, ledger stripes) and the same "PNG ↓ /
// Copy table" export with the site credit. The title is a sentence, often
// Chinese, so it stays in the body face (Graduate is labels-only, no CJK).
//
//   <StatTable title="…" file="fa-tier-1" headers={["Player", "PA"]} rows={[["Randy Arozarena", "670"]]} note="…" />
//
// `links` (optional) = one site path per row, e.g. "/players/664770", turning
// that row's first cell into a link that keeps the reader's locale; "" / null =
// no link. The export (PNG / copy) stays plain text.

type Cell = string | number | null | undefined;

const show = (v: Cell) => (v == null ? "" : String(v));

const LINK = "underline decoration-navy/30 underline-offset-4 transition-colors hover:text-brick hover:decoration-brick";

export default function StatTable({
  title,
  headers,
  rows,
  links,
  note,
  file,
}: {
  title: string;
  headers: Cell[];
  rows: Cell[][];
  links?: (string | null)[];
  note?: string;
  file?: string; // PNG file name (ASCII); defaults to the title
}) {
  const head = headers.map(show);
  const body = rows.map((r) => head.map((_, i) => show(r[i])));
  const right = rightAlignedColumns(body, head.length);
  const last = head.length - 1;
  const align = (i: number) => (right[i] ? "text-right" : "text-left");

  return (
    <figure className="my-8">
      <Reveal>
        <ScorecardFrame seedKey={`article-table-${file ?? title}`} variant="panel">
          <div className="relative z-10 p-4">
            <div className="flex items-start justify-between gap-2">
              <figcaption className="text-sm font-semibold leading-snug text-navy">{title}</figcaption>
              <TableExport headers={head} rows={body} name={file ?? title} caption={title} />
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-sm tabular-nums">
                <thead>
                  <tr className={HEAD_ROW}>
                    {head.map((h, i) => (
                      <th
                        key={i}
                        className={`${i === 0 ? `${TH_FIRST} sticky left-0 z-[1] bg-navy` : i === last ? TH_LAST : TH} ${align(i)}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri} className={`text-navy ${stripeBg(ri)}`}>
                      {r.map((c, i) => (
                        <td
                          key={i}
                          className={`${i === 0 ? `${TD_FIRST} sticky left-0 z-[1] bg-papaya` : i === last ? TD_LAST : TD} ${align(i)}`}
                        >
                          {i === 0 && links?.[ri] ? (
                            <Link href={links[ri]!} className={LINK}>
                              {c}
                            </Link>
                          ) : (
                            c
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {note && <p className="mt-2 text-[11px] leading-snug text-navy/55">{note}</p>}
          </div>
        </ScorecardFrame>
      </Reveal>
    </figure>
  );
}
