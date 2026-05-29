import { sql } from "./db";

export type FieldingSeason = {
  season: number;
  position: string;
  frv: number | null;
  oaa: number | null;
  oaa_in_front: number | null;
  oaa_lateral_toward_3b: number | null;
  oaa_lateral_toward_1b: number | null;
  oaa_behind: number | null;
  oaa_vs_rhh: number | null;
  oaa_vs_lhh: number | null;
};

export async function getFielding(
  mlbamId: number,
): Promise<FieldingSeason[]> {
  return sql<FieldingSeason[]>`
    select
      season,
      position,
      frv,
      oaa,
      oaa_in_front,
      oaa_lateral_toward_3b,
      oaa_lateral_toward_1b,
      oaa_behind,
      oaa_vs_rhh,
      oaa_vs_lhh
    from web_fielding_frv
    where mlbam_id = ${mlbamId}
    order by season desc, position
  `;
}
