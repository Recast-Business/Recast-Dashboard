/**
 * PDF export — uses the same CSVColumn<Row> shape as csv.ts so each
 * section only needs to define its columns once.
 *
 *   exportRowsToPDF({
 *     filename: "vendors-2026.pdf",
 *     title: "Vendors — 2026",
 *     subtitle: "All divisions",
 *     rows,
 *     columns,
 *   });
 */

import type { CSVColumn } from "./csv";

// Round-2 performance (friction audit #16): jspdf + jspdf-autotable
// are dynamic-imported inside the export function instead of at
// module top-level. Statically they rode in the main bundle — every
// login downloaded the whole PDF engine whether or not anyone ever
// clicked Export. Now the engine only downloads on first click
// (Vite splits it into its own lazy chunk automatically).

interface ExportPDFArgs<Row> {
  filename: string;
  title: string;
  subtitle?: string;
  rows: Row[];
  columns: CSVColumn<Row>[];
  /** Force orientation. Defaults to landscape when there are 8+ columns. */
  orientation?: "portrait" | "landscape";
  /** Footer note (e.g. "Confidential — Recast Internal"). */
  footer?: string;
}

export async function exportRowsToPDF<Row>({
  filename,
  title,
  subtitle,
  rows,
  columns,
  orientation,
  footer = "Confidential · Recast internal",
}: ExportPDFArgs<Row>): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const o: "portrait" | "landscape" =
    orientation ?? (columns.length >= 8 ? "landscape" : "portrait");

  const doc = new jsPDF({ orientation: o, unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;

  // Header band
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RECAST", margin, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    pageWidth - margin,
    36,
    { align: "right" },
  );

  // Title + subtitle
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 64);

  let bodyTop = 80;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(subtitle, margin, bodyTop);
    bodyTop += 16;
    doc.setTextColor(0);
  }

  // Body table
  const head = [columns.map((c) => c.header)];
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      return v == null ? "" : String(v);
    }),
  );

  autoTable(doc, {
    head,
    body,
    startY: bodyTop + 4,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
      lineColor: [220, 220, 220],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [31, 42, 68],         // navy — same as the brief doc title
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [249, 249, 250],
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer with page number + custom note
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(footer, margin, pageHeight - 16);
      const pageStr = `Page ${data.pageNumber}`;
      doc.text(pageStr, pageWidth - margin, pageHeight - 16, { align: "right" });
    },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
