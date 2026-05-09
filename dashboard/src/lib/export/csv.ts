/**
 * CSV export utility — single source of truth for download UX across the app.
 *
 * Pattern:
 *   exportRowsToCSV("vendors-2026.csv", rows, [
 *     { header: "Name", value: (r) => r.name },
 *     { header: "Method", value: (r) => r.payment_method ?? "" },
 *     ...
 *   ]);
 *
 * Trigger from a button:
 *   <ExportCSVButton filename={...} rows={...} columns={...} />
 */

export interface CSVColumn<Row> {
  header: string;
  /** Returns the cell value. Can return strings, numbers, or null/undefined (rendered as ""). */
  value: (row: Row) => string | number | null | undefined;
}

/**
 * Escape a single field for RFC-4180 CSV. Wraps in quotes and doubles
 * any embedded quotes. Handles newlines + commas safely.
 */
function escapeField(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from rows + column descriptors. */
export function buildCSV<Row>(rows: Row[], columns: CSVColumn<Row>[]): string {
  const headerLine = columns.map((c) => escapeField(c.header)).join(",");
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeField(c.value(row))).join(","),
  );
  return [headerLine, ...bodyLines].join("\n");
}

/**
 * Build a CSV and trigger a download in the browser. Adds a UTF-8 BOM so
 * Excel renders accented characters correctly without "import wizard" steps.
 */
export function exportRowsToCSV<Row>(
  filename: string,
  rows: Row[],
  columns: CSVColumn<Row>[],
): void {
  const csv = "﻿" + buildCSV(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke to give Safari/Firefox time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convenience: build the 12 monthly columns for a payment-grid export.
 * `getCell` returns the amount (or null) for (row, month). Adds a TOTAL
 * column at the end summing the 12 cells.
 */
export function monthlyAmountColumns<Row>(
  getCell: (row: Row, month: number) => number | null | undefined,
): CSVColumn<Row>[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const cols: CSVColumn<Row>[] = months.map((m, i) => ({
    header: m,
    value: (row) => {
      const n = getCell(row, i + 1);
      return n != null ? Number(n).toFixed(2) : "";
    },
  }));
  cols.push({
    header: "Total",
    value: (row) => {
      let sum = 0;
      for (let m = 1; m <= 12; m++) sum += Number(getCell(row, m) ?? 0);
      return sum.toFixed(2);
    },
  });
  return cols;
}
