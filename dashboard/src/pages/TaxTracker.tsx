import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  IdCard,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EyebrowLabel, MetricStrip, YearSelector } from "@/components/recast";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { useTaxTrackerSubjects, useUpsertTaxRecord, useUpdateSubjectTax } from "@/hooks/useTaxRecords";
import type { TaxTrackerRow } from "@/hooks/useTaxRecords";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Round 4 B — year-end tax tracker page (/tax).
 *
 * Lists every subject (creator + vendor) tagged with
 * requires_tax_info=true for a given year. Each row surfaces:
 *
 *   • W9 status — received / not received, with the link button
 *   • 1099 status — sent / not sent, with the link button
 *   • Amount reported (manual entry)
 *   • Notes
 *
 * Editing happens inline via the cell click → small input row drops
 * open inside the row. Less ceremony than a modal for a fast year-end
 * sweep.
 *
 * Admin + finance only (RLS on tax_records also enforces it server-
 * side). The /tax route blocks partner + operator from rendering at
 * all, matching the data sensitivity.
 *
 * CSV export still available for handing to the accountant in
 * whatever format they prefer.
 */

export function TaxTrackerPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const { data: rows, isLoading } = useTaxTrackerSubjects(year);
  const upsertRecord = useUpsertTaxRecord();
  const updateSubject = useUpdateSubjectTax();

  // Inline-edit state: which (subject_kind|subject_id) is expanded.
  const [editingKey, setEditingKey] = React.useState<string | null>(null);

  const all = rows ?? [];
  const filtered = all; // No search needed yet — tagged set is small.

  // KPI tile counts.
  const kpis = React.useMemo(() => {
    let w9Received = 0;
    let ten99Sent = 0;
    let withAmount = 0;
    for (const r of all) {
      if (r.w9_received_at) w9Received++;
      if (r.record?.ten99_sent_at) ten99Sent++;
      if (r.record?.amount_reported != null) withAmount++;
    }
    return {
      total: all.length,
      w9Received,
      ten99Sent,
      withAmount,
    };
  }, [all]);

  const csvRows = React.useMemo(
    () =>
      filtered.map((r) => ({
        name: r.name,
        kind:
          r.subject_kind === "creator"
            ? "Creator"
            : r.vendor_kind === "talent_we_pay"
              ? "Contractor"
              : "Vendor",
        w9_received: r.w9_received_at ? "Yes" : "No",
        w9_url: r.w9_url ?? "",
        ten99_sent: r.record?.ten99_sent_at ? "Yes" : "No",
        ten99_url: r.record?.ten99_url ?? "",
        amount: r.record?.amount_reported ?? "",
        notes: r.record?.notes ?? "",
      })),
    [filtered],
  );

  function key(r: TaxTrackerRow) {
    return `${r.subject_kind}|${r.subject_id}`;
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EyebrowLabel withRule>Tax Tracker · {year}</EyebrowLabel>
          <h1 className="mt-2 font-display text-h2 font-bold tracking-[-0.02em]">
            Year-end 1099 prep
          </h1>
          <p className="mt-1 max-w-[80ch] text-[13px] text-steel">
            Tracks W9 receipt + 1099 issuance + amount reported for every
            person and vendor tagged for tax info. Tag a subject from
            their profile dialog (Talents or Vendors) — they then surface
            here. Default behaviour is "not tracked" so the list stays
            focused on the contractors that actually need a 1099.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <MetricStrip
        tiles={[
          {
            label: "Tracked subjects",
            value: String(kpis.total),
            icon: IdCard,
          },
          {
            label: "W9 received",
            value: String(kpis.w9Received),
            sub:
              kpis.total > 0
                ? `${Math.round((kpis.w9Received / kpis.total) * 100)}% of tracked`
                : undefined,
            icon: FileCheck2,
            tone:
              kpis.total > 0 && kpis.w9Received < kpis.total
                ? "partial"
                : "paid",
          },
          {
            label: "1099s sent",
            value: String(kpis.ten99Sent),
            sub: `for ${year}`,
            icon: Receipt,
            tone:
              kpis.total > 0 && kpis.ten99Sent < kpis.total
                ? "partial"
                : "paid",
          },
          {
            label: "Amounts entered",
            value: String(kpis.withAmount),
            sub: `for ${year}`,
            icon: AlertTriangle,
            tone:
              kpis.total > 0 && kpis.withAmount < kpis.total
                ? "partial"
                : "paid",
          },
        ]}
      />

      {/* ── Action row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-steel">
          {filtered.length} subject{filtered.length === 1 ? "" : "s"} tracked
        </span>
        <span className="ml-auto">
          <ExportCSVButton
            filename={`recast-tax-${year}.csv`}
            rows={csvRows}
            label="Export CSV"
            disabled={csvRows.length === 0}
            columns={[
              { header: "Name",        value: (r) => r.name },
              { header: "Kind",        value: (r) => r.kind },
              { header: "W9 received", value: (r) => r.w9_received },
              { header: "W9 link",     value: (r) => r.w9_url },
              { header: "1099 sent",   value: (r) => r.ten99_sent },
              { header: "1099 link",   value: (r) => r.ten99_url },
              { header: "Amount",      value: (r) => String(r.amount) },
              { header: "Notes",       value: (r) => r.notes },
            ]}
          />
        </span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-lg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          No subjects tagged for tax tracking yet. Open any talent or
          vendor profile and flip "Requires tax info / 1099" to add them
          here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <Th sticky>Subject</Th>
                  <Th>W9</Th>
                  <Th>1099 · {year}</Th>
                  <Th right>Amount reported</Th>
                  <Th>Notes</Th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const k = key(r);
                  const isEditing = editingKey === k;
                  return (
                    <React.Fragment key={k}>
                      <tr
                        className={cn(
                          "group border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]",
                          isEditing && "bg-white/[0.04]",
                        )}
                      >
                        <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2.5">
                          <div className="text-[13px] font-medium text-white">
                            {r.name}
                          </div>
                          <div className="text-[11px] text-steel">
                            {r.subject_kind === "creator"
                              ? "Creator"
                              : r.vendor_kind === "talent_we_pay"
                                ? "Contractor"
                                : "Vendor"}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <StatusCell
                            ok={!!r.w9_received_at}
                            label={r.w9_received_at ? "Received" : "Missing"}
                            url={r.w9_url}
                          />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <StatusCell
                            ok={!!r.record?.ten99_sent_at}
                            label={r.record?.ten99_sent_at ? "Sent" : "Not sent"}
                            url={r.record?.ten99_url ?? null}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          {r.record?.amount_reported != null ? (
                            <div className="tabular text-[13px] font-medium text-white">
                              {formatUSD(Number(r.record.amount_reported), { decimals: 0 })}
                            </div>
                          ) : (
                            <span className="text-[12px] text-steel">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className="line-clamp-2 max-w-[260px] text-[12px] text-steel"
                            title={r.record?.notes ?? ""}
                          >
                            {r.record?.notes ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => setEditingKey(isEditing ? null : k)}
                          >
                            {isEditing ? "Close" : "Edit"}
                          </Button>
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr className="border-b border-rule bg-[#0d0d0d]">
                          <td colSpan={6} className="px-4 py-3">
                            <InlineEditor
                              row={r}
                              year={year}
                              onSaveSubject={(p) =>
                                updateSubject.mutate({
                                  subject_kind: r.subject_kind,
                                  subject_id: r.subject_id,
                                  ...p,
                                })
                              }
                              onSaveRecord={(p) =>
                                upsertRecord.mutate({
                                  subject_kind: r.subject_kind,
                                  subject_id: r.subject_id,
                                  year,
                                  ...p,
                                })
                              }
                              onClose={() => setEditingKey(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Inline editor — drops open below the row when "Edit" is clicked.
// Two-column layout: W9 (left) + 1099 (right). Save buttons split
// because the two halves write to different tables.
// ─────────────────────────────────────────────────────────────────────

function InlineEditor({
  row,
  year,
  onSaveSubject,
  onSaveRecord,
  onClose,
}: {
  row: TaxTrackerRow;
  year: number;
  onSaveSubject: (p: { w9_url?: string | null; w9_received_at?: string | null }) => void;
  onSaveRecord: (p: {
    amount_reported?: number | null;
    ten99_url?: string | null;
    ten99_sent_at?: string | null;
    notes?: string | null;
  }) => void;
  onClose: () => void;
}) {
  const [w9Url, setW9Url] = React.useState(row.w9_url ?? "");
  const [w9Received, setW9Received] = React.useState(!!row.w9_received_at);

  const rec = row.record;
  const [ten99Url, setTen99Url] = React.useState(rec?.ten99_url ?? "");
  const [ten99Sent, setTen99Sent] = React.useState(!!rec?.ten99_sent_at);
  const [amount, setAmount] = React.useState<string>(
    rec?.amount_reported != null ? String(rec.amount_reported) : "",
  );
  const [notes, setNotes] = React.useState(rec?.notes ?? "");

  function saveW9() {
    onSaveSubject({
      w9_url: w9Url.trim() || null,
      // Toggle changed? Set timestamp accordingly; keep existing if no toggle change.
      w9_received_at: w9Received
        ? (row.w9_received_at ?? new Date().toISOString())
        : null,
    });
  }

  function save1099() {
    const num = amount.trim() === "" ? null : Number(amount);
    if (num != null && (!Number.isFinite(num) || num < 0)) {
      toast.error("Amount must be a non-negative number.");
      return;
    }
    onSaveRecord({
      amount_reported: num,
      ten99_url: ten99Url.trim() || null,
      ten99_sent_at: ten99Sent
        ? (rec?.ten99_sent_at ?? new Date().toISOString())
        : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* W9 column */}
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
            W9 (forever)
          </div>
          <label className="flex items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={w9Received}
              onChange={(e) => setW9Received(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--electric)]"
            />
            Received
          </label>
        </div>
        <div className="mt-2 grid gap-1.5">
          <label className="text-[11px] text-steel">Link</label>
          <Input
            type="url"
            value={w9Url}
            onChange={(e) => setW9Url(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="h-8 text-[12px]"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" className="h-7 text-[11px]" onClick={saveW9}>
            Save W9
          </Button>
        </div>
      </div>

      {/* 1099 column */}
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
            1099 · {year}
          </div>
          <label className="flex items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={ten99Sent}
              onChange={(e) => setTen99Sent(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--electric)]"
            />
            Sent
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <label className="text-[11px] text-steel">Link</label>
            <Input
              type="url"
              value={ten99Url}
              onChange={(e) => setTen99Url(e.target.value)}
              placeholder="https://drive.google.com/…"
              className="h-8 text-[12px]"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[11px] text-steel">Amount reported</label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-8 text-[12px]"
            />
          </div>
        </div>
        <div className="mt-2 grid gap-1.5">
          <label className="text-[11px] text-steel">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-[12px]"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={save1099}>
            Save 1099
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────

function Th({
  sticky,
  right,
  children,
}: {
  sticky?: boolean;
  right?: boolean;
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-steel",
        right ? "text-right" : "text-left",
        sticky && "sticky left-0 z-10 min-w-[200px] bg-[#0d0d0d] px-4",
      )}
    >
      {children}
    </th>
  );
}

function StatusCell({
  ok,
  label,
  url,
}: {
  ok: boolean;
  label: string;
  url: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
          ok ? "bg-paid-tint text-paid" : "bg-overdue-tint text-overdue",
        )}
      >
        {ok ? <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2} /> : <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} />}
        {label}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-steel hover:text-electric"
          title="Open document"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
        </a>
      ) : null}
    </div>
  );
}

// R5 follow-up: local CountTile + YearSelector removed — consolidated
// onto `MetricStrip` / `MetricTile` / `YearSelector` from @/components/recast.
