// Which columns of a plain display-string table read right-aligned: a column
// of numbers (".292", "24.5%", "+3.2", "10-11", "4.12 (3rd)") like every
// on-page stat table, while a column of words stays left. The first column is
// the row label and always left. Shared by the table PNG export and the
// article StatTable, so a table and its PNG never disagree.

const NUMERIC = /^[-+−–]?[.\d]/;

export function rightAlignedColumns(rows: string[][], columns: number): boolean[] {
  return Array.from({ length: columns }, (_, i) => {
    if (i === 0) return false;
    const filled = rows.map((r) => r[i]).filter(Boolean);
    return filled.length > 0 && filled.filter((v) => NUMERIC.test(v)).length * 2 >= filled.length;
  });
}
