/**
 * Phase M-4: Filtered House export — produces a PDF or CSV statement
 * for one or all residents, optionally narrowed to rent only / utilities
 * only / both, plus the activity Frazier sends out monthly.
 *
 * Stays pure — takes raw data in, produces a download out. The dialog
 * (HouseExportDialog) handles the filter UX and calls these.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  HouseResident,
  HouseRentPayment,
  HouseUtility,
  HouseUtilityPayment,
  RentGroup,
} from "@/types/finance";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type ExportScope = "rent" | "utilities" | "both";
export type ExportFormat = "pdf" | "csv";

export interface HouseExportInput {
  year: number;
  scope: ExportScope;
  /** When null/empty, produces a household-wide statement. */
  residentIds: string[] | null;
  format: ExportFormat;
  // Raw data
  residents: HouseResident[];
  rentGroups: RentGroup[];
  rentByGroup: Record<string, Record<number, HouseRentPayment>>;
  utilities: HouseUtility[];
  utilityByUtility: Record<string, Record<number, HouseUtilityPayment>>;
}

/** Floor-each + Frazier-takes-remainder cent rounding so each utility's
 *  monthly bill reconciles exactly across residents. Pure copy of the
 *  PerResidentSplitPanel logic — kept here so the export doesn't depend
 *  on the React component. */
function utilityShareForResident(
  total: number,
  residentIdx: number,
  frazierIdx: number,
  activeResidents: number,
): number {
  if (total <= 0 || activeResidents === 0) return 0;
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / activeResidents);
  const remainderCents = totalCents - baseCents * activeResidents;
  if (residentIdx === frazierIdx) {
    return (baseCents + remainderCents) / 100;
  }
  return baseCents / 100;
}

function findFrazierIdx(active: HouseResident[]): number {
  const idx = active.findIndex((r) => r.name.toLowerCase().includes("frazier"));
  return idx >= 0 ? idx : 0;
}

interface RentMonthRow {
  month: number;
  groupRent: number;       // total rent for the group that month
  paid: number;             // amount_paid on the rent row
  status: string;
}

interface UtilityMonthRow {
  month: number;
  utility_name: string;
  total: number;            // bill total that month
  share: number;            // resident's share
  status: string;           // bill-level status
}

function fmtUSD(n: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

// ─────────────────────────────────────────────────────────────────────
// Data assembly per resident
// ─────────────────────────────────────────────────────────────────────

function buildRentRows(
  resident: HouseResident,
  rentGroups: RentGroup[],
  rentByGroup: Record<string, Record<number, HouseRentPayment>>,
): { rows: RentMonthRow[]; group: RentGroup | null; groupResidents: HouseResident[] } {
  const group = rentGroups.find((g) => g.id === resident.rent_group_id) ?? null;
  if (!group) return { rows: [], group: null, groupResidents: [] };
  const cells = rentByGroup[group.id] ?? {};
  const rows: RentMonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const c = cells[m];
    rows.push({
      month: m,
      groupRent: Number(c?.amount ?? group.monthly_rent) || 0,
      paid: Number(c?.amount_paid) || 0,
      status: c?.status ?? "—",
    });
  }
  // Find other residents in the same group (for the H&K case, so we can
  // show "Group: Harriet & Keenan ($600 each, $1200 total)" context).
  const groupResidents: HouseResident[] = []; // not strictly needed for the export
  return { rows, group, groupResidents };
}

function buildUtilityRows(
  resident: HouseResident,
  activeResidents: HouseResident[],
  utilities: HouseUtility[],
  utilityByUtility: Record<string, Record<number, HouseUtilityPayment>>,
): UtilityMonthRow[] {
  const residentIdx = activeResidents.findIndex((r) => r.id === resident.id);
  if (residentIdx < 0) return []; // inactive resident
  const frazierIdx = findFrazierIdx(activeResidents);
  const rows: UtilityMonthRow[] = [];
  for (const u of utilities) {
    const cells = utilityByUtility[u.id] ?? {};
    for (let m = 1; m <= 12; m++) {
      const c = cells[m];
      const total = Number(c?.amount) || 0;
      if (total <= 0) continue;
      const share = utilityShareForResident(total, residentIdx, frazierIdx, activeResidents.length);
      rows.push({
        month: m,
        utility_name: u.utility_name,
        total,
        share,
        status: c?.status ?? "—",
      });
    }
  }
  // Sort by month then utility name for predictable output
  rows.sort((a, b) => a.month - b.month || a.utility_name.localeCompare(b.utility_name));
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// PDF rendering
// ─────────────────────────────────────────────────────────────────────

function addPageHeader(doc: jsPDF, title: string, subtitle?: string) {
  const margin = 32;
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("RECAST", margin, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
    pageWidth - margin,
    36,
    { align: "right" },
  );

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 64);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(subtitle, margin, 80);
    doc.setTextColor(0);
  }
}

interface PerResidentSection {
  resident: HouseResident;
  rentRows: RentMonthRow[];
  rentGroup: RentGroup | null;
  utilityRows: UtilityMonthRow[];
}

function renderPerResidentPDF(
  doc: jsPDF,
  section: PerResidentSection,
  scope: ExportScope,
  year: number,
  isFirst: boolean,
) {
  if (!isFirst) doc.addPage();
  const margin = 32;
  addPageHeader(
    doc,
    `Statement — ${section.resident.name}`,
    `${MONTH_LABELS[0]} – ${MONTH_LABELS[11]} ${year}`,
  );
  let cursorY = 100;

  const rentTotal = section.rentRows.reduce((s, r) => s + r.groupRent, 0);
  const rentPaid = section.rentRows.reduce((s, r) => s + r.paid, 0);
  const rentOwed = Math.max(0, rentTotal - rentPaid);

  const utilTotal = section.utilityRows.reduce((s, r) => s + r.share, 0);

  // ─── RENT TABLE
  if (scope !== "utilities" && section.rentGroup) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      `Rent · Group: ${section.rentGroup.label} · ${fmtUSD(section.rentGroup.monthly_rent, 2)}/month`,
      margin,
      cursorY,
    );
    cursorY += 6;

    autoTable(doc, {
      head: [["Month", "Owed", "Paid", "Outstanding", "Status"]],
      body: section.rentRows.map((r) => [
        `${MONTH_SHORT[r.month - 1]} ${year}`,
        fmtUSD(r.groupRent, 2),
        fmtUSD(r.paid, 2),
        fmtUSD(Math.max(0, r.groupRent - r.paid), 2),
        r.status,
      ]),
      foot: [[
        "Total",
        fmtUSD(rentTotal, 2),
        fmtUSD(rentPaid, 2),
        fmtUSD(rentOwed, 2),
        "",
      ]],
      startY: cursorY + 4,
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.5 },
      headStyles: { fillColor: [31, 42, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    });
    // jsPDF-autotable extends the doc with `lastAutoTable`
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  // ─── UTILITY SHARE TABLE
  if (scope !== "rent" && section.utilityRows.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Utility share — ${section.resident.name}'s portion`, margin, cursorY);
    cursorY += 6;

    autoTable(doc, {
      head: [["Month", "Utility", "Bill Total", "Your Share", "Status"]],
      body: section.utilityRows.map((r) => [
        `${MONTH_SHORT[r.month - 1]} ${year}`,
        r.utility_name,
        fmtUSD(r.total, 2),
        fmtUSD(r.share, 2),
        r.status,
      ]),
      foot: [[
        "Total",
        "",
        "",
        fmtUSD(utilTotal, 2),
        "",
      ]],
      startY: cursorY + 4,
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.5 },
      headStyles: { fillColor: [31, 42, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  // ─── SUMMARY BLOCK
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary", margin, cursorY);
  cursorY += 16;

  const summaryLines: Array<[string, string]> = [];
  if (scope !== "utilities") {
    summaryLines.push(["Total rent owed (year)", fmtUSD(rentTotal, 2)]);
    summaryLines.push(["Total rent paid (year)", fmtUSD(rentPaid, 2)]);
    summaryLines.push(["Rent outstanding", fmtUSD(rentOwed, 2)]);
  }
  if (scope !== "rent") {
    summaryLines.push(["Total utility share (year)", fmtUSD(utilTotal, 2)]);
  }
  if (scope === "both") {
    summaryLines.push(["Combined balance (rent + utilities)", fmtUSD(rentOwed + utilTotal, 2)]);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [label, value] of summaryLines) {
    doc.setTextColor(80);
    doc.text(label, margin, cursorY);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + 280, cursorY);
    doc.setFont("helvetica", "normal");
    cursorY += 14;
  }
}

// ─────────────────────────────────────────────────────────────────────
// CSV rendering
// ─────────────────────────────────────────────────────────────────────

function renderCSV(input: HouseExportInput, sections: PerResidentSection[]): string {
  const lines: string[] = [];

  for (const sec of sections) {
    lines.push(`Resident,${sec.resident.name}`);
    lines.push("");

    if (input.scope !== "utilities") {
      lines.push("Rent");
      lines.push("Month,Owed,Paid,Outstanding,Status");
      let totalOwed = 0;
      let totalPaid = 0;
      for (const r of sec.rentRows) {
        const out = Math.max(0, r.groupRent - r.paid);
        totalOwed += r.groupRent;
        totalPaid += r.paid;
        lines.push(
          [`${MONTH_SHORT[r.month - 1]} ${input.year}`, r.groupRent.toFixed(2), r.paid.toFixed(2), out.toFixed(2), r.status].join(","),
        );
      }
      lines.push(["Total", totalOwed.toFixed(2), totalPaid.toFixed(2), Math.max(0, totalOwed - totalPaid).toFixed(2), ""].join(","));
      lines.push("");
    }

    if (input.scope !== "rent") {
      lines.push("Utility share");
      lines.push("Month,Utility,Bill Total,Your Share,Status");
      let totalShare = 0;
      for (const r of sec.utilityRows) {
        totalShare += r.share;
        lines.push(
          [
            `${MONTH_SHORT[r.month - 1]} ${input.year}`,
            `"${r.utility_name.replace(/"/g, '""')}"`,
            r.total.toFixed(2),
            r.share.toFixed(2),
            r.status,
          ].join(","),
        );
      }
      lines.push(["Total", "", "", totalShare.toFixed(2), ""].join(","));
      lines.push("");
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────

export function exportHouseStatement(input: HouseExportInput): void {
  const activeResidents = input.residents.filter((r) => r.active);
  const targetResidents =
    input.residentIds && input.residentIds.length > 0
      ? activeResidents.filter((r) => input.residentIds!.includes(r.id))
      : activeResidents;

  const sections: PerResidentSection[] = targetResidents.map((resident) => {
    const { rows: rentRows, group: rentGroup } = buildRentRows(
      resident,
      input.rentGroups,
      input.rentByGroup,
    );
    const utilityRows = buildUtilityRows(
      resident,
      activeResidents,
      input.utilities,
      input.utilityByUtility,
    );
    return { resident, rentRows, rentGroup, utilityRows };
  });

  if (sections.length === 0) {
    throw new Error("No active residents matched the filter.");
  }

  const fileNameBase =
    targetResidents.length === 1
      ? targetResidents[0].name.toLowerCase().replace(/\s+/g, "-")
      : "house";
  const filename = `recast-${fileNameBase}-${input.scope}-${input.year}`;

  if (input.format === "pdf") {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    sections.forEach((section, i) => {
      renderPerResidentPDF(doc, section, input.scope, input.year, i === 0);
    });
    doc.save(`${filename}.pdf`);
  } else {
    const csv = renderCSV(input, sections);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
