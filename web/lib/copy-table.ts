// P12 M7: copy any table to the clipboard as TSV, which pastes cleanly into
// Google Sheets / Excel / Docs. Generic on purpose (P13 reuses it): plain
// headers + rows in, no knowledge of the table that produced them. Cells are the
// display strings the page shows (".292", "24.5%"), so a spreadsheet keeps the
// same formatting the reader saw.

export type Cell = string | number | null | undefined;

// A bare "N-N" pair (W-L "10-11", RS-RA "122-146") is parsed as a DATE by Excel
// and Sheets (10-11 -> Oct 11). An en dash keeps it text and reads the same.
const RECORD_LIKE = /^(\d{1,4})-(\d{1,4})$/;

export function toTsv(headers: Cell[], rows: Cell[][]): string {
  const cell = (v: Cell) =>
    v == null
      ? ""
      : String(v)
          .replace(/[\t\r\n]+/g, " ")
          .trim()
          .replace(RECORD_LIKE, "$1–$2");
  return [headers, ...rows].map((r) => r.map(cell).join("\t")).join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
