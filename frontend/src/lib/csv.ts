/**
 * RFC 4180 CSV, both directions.
 *
 * Hand-rolled rather than pulled from a package because the whole surface is
 * two functions and the failure modes are the interesting part: sellers do not
 * hand-author these files, they export from Excel, Google Sheets or whatever
 * their previous shop platform produced. That means the parser has to survive
 * quoted fields containing commas, embedded newlines inside a quoted cell,
 * doubled quotes as an escape, CRLF *and* LF line endings, and a UTF-8 BOM,
 * because every one of those is what a real spreadsheet emits.
 */

/**
 * Excel decides a .csv is legacy 8-bit text unless it opens with a byte-order
 * mark, so a shop called "Kahawa Café" comes back as "CafÃ©". Every writer here
 * emits one; the parser strips it back off, which is what makes an exported
 * file round-trip cleanly through a spreadsheet and back into an import.
 */
const BOM = "﻿";

/** Quote when the value contains the delimiter, a quote, a newline, or edge
 * whitespace that a naive reader would silently trim away. */
const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/;

function encodeField(value: string): string {
  return NEEDS_QUOTING.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Rows to CSV text. CRLF because that is what RFC 4180 specifies and what
 * Windows Excel is happiest with; every parser worth the name accepts it.
 *
 * Deliberately NOT doing spreadsheet formula escaping (prefixing a leading
 * `=`, `+`, `-` or `@` with a quote). That mitigation exists for CSVs built
 * from OTHER people's input, and it corrupts the value: a product legitimately
 * named "+Size Tee" would come back with a stray quote and then re-import
 * wrong. Every export here is a merchant's own catalogue sent to that same
 * merchant, so there is no second party whose text could reach the file.
 */
export function encodeCsv(rows: string[][]): string {
  if (rows.length === 0) return BOM;
  return BOM + rows.map((row) => row.map(encodeField).join(",")).join("\r\n") + "\r\n";
}

/**
 * CSV text to rows. Never throws: malformed input degrades to the best reading
 * available (an unterminated quote simply runs to end of file) so that callers
 * can report per-row validation errors against real line numbers instead of
 * rejecting the whole upload with a parse failure the seller cannot act on.
 *
 * Blank lines are dropped rather than returned as empty rows: a trailing
 * newline is normal, and a spreadsheet that exports a few empty rows at the
 * bottom of the sheet should not produce "row 41 is missing a SKU".
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };

  const endRow = () => {
    endField();
    const blank = row.length === 1 && row[0] === "";
    if (!blank) rows.push(row);
    row = [];
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is a literal quote; a single
        // one closes the field.
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Only a quote at the START of a field opens quoting. A stray quote in the
    // middle of an unquoted value (`30" monitor`) is data, not syntax.
    if (ch === '"' && field === "") {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // A file with no trailing newline still has one row left in hand.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Hands the browser a file to save. Object URLs are revoked on the next tick
 * rather than immediately: Firefox cancels the download if the URL dies before
 * it has been read.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
