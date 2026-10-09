/**
 * One CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @ at the
 * start: client names and notes can come from other people) gets a leading
 * apostrophe; numbers are written as they are.
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV with CRLF line ends and a BOM, so Excel reads UTF-8 (Polish characters) correctly. */
export function toCsv(rows: (string | number)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
