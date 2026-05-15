import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { EyebrowLabel, InvoiceCell, MoneyCell, StatusPill } from "@/components/recast";
import { useVendor, useDeleteVendor } from "@/hooks/useVendors";
import { useVendorPayments } from "@/hooks/useVendorPayments";
import { useVendorInvoices } from "@/hooks/useVendorInvoices";
import { useReceiptsForObligor } from "@/hooks/usePaymentReceipts";
import { useVendorAgreements } from "@/hooks/useVendorAgreements";
import { PaymentCellDialog } from "@/components/finance/PaymentCellDialog";
import { VendorDialog } from "@/components/finance/VendorDialog";
import { VendorInvoiceDialog } from "@/components/finance/VendorInvoiceDialog";
import { useConfirm } from "@/hooks/useConfirm";
import type { VendorInvoice, VendorPayment } from "@/types/finance";
import { cn, formatUSD, formatDate } from "@/lib/utils";

/**
 * Phase L (C4b): Vendor detail page.
 *
 * The big spec §11 setpiece:
 *
 *   ┌─ Header ────────────────────────────────────────────┐
 *   │ ← Back to Vendors                                   │
 *   │ Vendor Name (display 38px)        [Edit] [Year ▼]   │
 *   │ Subtitle / contract category                        │
 *   ├─ Main column ────────────────┬─ Side panel (320px) ─┤
 *   │ Recurring monthly grid        │ Vendor metadata     │
 *   │ Ad-hoc invoices table         │ Contact info        │
 *   │ YTD totals strip              │ Recent receipts (5) │
 *   │ Danger zone (Archive/Delete)  │                     │
 *   └───────────────────────────────┴─────────────────────┘
 *
 * Per spec §11:
 *   • Side panel: 320px column at desktop, drops below at <1100px
 *   • Recent receipts cap at 5 with "All" link
 *   • Danger-zone Delete is the only destructive button in red —
 *     every other delete is a quiet icon
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  auto_pay: "Auto pay",
  paypal: "PayPal",
  domestic_wire: "Domestic wire",
  international_transfer: "International transfer",
  bank_ach: "Bank ACH",
  zelle: "Zelle",
  invoice_link: "Invoice link",
  website_link: "Website link",
  credit_card: "Credit card",
};

const KIND_LABEL: Record<string, string> = {
  vendor: "Vendor",
  talent_we_pay: "Talent we pay",
  talent_that_pays_us: "Talent paying us",
  utility: "Utility",
  employee: "Employee",
  credit_card_account: "Credit card account",
};

const DIVISION_LABEL: Record<string, string> = {
  onlyfans: "OnlyFans",
  telegram: "Telegram",
  efuse: "Overlay",
};

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [vendorEditOpen, setVendorEditOpen] = React.useState(false);
  const [editingCell, setEditingCell] = React.useState<{
    month: number;
    existing: VendorPayment | null;
  } | null>(null);
  const [editingInvoice, setEditingInvoice] = React.useState<VendorInvoice | null>(null);
  const [creatingInvoice, setCreatingInvoice] = React.useState(false);

  const { data: vendor, isLoading: vendorLoading, error: vendorError } = useVendor(id);
  const { data: payments } = useVendorPayments(id ?? null, year);
  const { data: invoices } = useVendorInvoices(id ?? null);
  // R5 Sweep 4: vendor_agreements list for the side-panel card. Gated
  // to kind='vendor' in render — the hook is fine to call for any
  // kind, returns empty for kinds with no agreements.
  const { data: agreements } = useVendorAgreements(id ?? null);
  const { data: receipts } = useReceiptsForObligor(
    id && vendor ? { source: "vendor", vendor_id: id } : null,
    !!vendor,
  );

  const del = useDeleteVendor();
  const confirm = useConfirm();

  // Index recurring payments by month for quick cell lookup.
  const paymentByMonth = React.useMemo(() => {
    const m: Record<number, VendorPayment> = {};
    for (const p of payments ?? []) m[p.period_month] = p;
    return m;
  }, [payments]);

  // Totals across recurring grid + ad-hoc invoices for the YTD strip.
  const totals = React.useMemo(() => {
    let recurringBilled = 0;
    let recurringPaid = 0;
    let recurringCount = 0;
    let recurringPaidCount = 0;
    for (const p of payments ?? []) {
      const amt = Number(p.amount) || 0;
      if (amt > 0) {
        recurringBilled += amt;
        recurringCount++;
        if (p.status === "paid") {
          recurringPaid += amt;
          recurringPaidCount++;
        }
      }
    }

    let adhocBilled = 0;
    let adhocPaid = 0;
    let adhocCount = 0;
    for (const inv of invoices ?? []) {
      adhocBilled += Number(inv.amount) || 0;
      adhocCount++;
      if (inv.status === "paid") adhocPaid += Number(inv.amount) || 0;
    }

    const totalBilled = recurringBilled + adhocBilled;
    const totalPaid = recurringPaid + adhocPaid;

    return {
      recurringBilled,
      recurringPaid,
      recurringCount,
      recurringPaidCount,
      adhocBilled,
      adhocPaid,
      adhocCount,
      totalBilled,
      totalPaid,
      outstanding: Math.max(0, totalBilled - totalPaid),
      avgPerMonth: recurringCount > 0 ? recurringBilled / recurringCount : 0,
    };
  }, [payments, invoices]);

  async function onDelete() {
    if (!vendor) return;
    const ok = await confirm({
      title: `Delete ${vendor.name}?`,
      description:
        "Permanently removes this vendor and every logged monthly payment, ad-hoc invoice, and receipt. Cannot be undone.",
      confirmLabel: "Delete vendor",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(vendor.id);
      toast.success(`${vendor.name} deleted`);
      navigate("/vendors");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  if (vendorError) {
    return (
      <div className="space-y-4">
        <Link to="/vendors" className="inline-flex items-center gap-1 text-[12px] text-steel hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Vendors
        </Link>
        <div className="rounded-lg border border-overdue/30 bg-overdue-tint p-4 text-[13px] text-overdue">
          Failed to load vendor: {(vendorError as Error).message}
        </div>
      </div>
    );
  }

  if (vendorLoading || !vendor) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-[420px] w-full rounded-lg" />
          <Skeleton className="h-[420px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const now = new Date();
  const currentMonthIdx = year === now.getFullYear() ? now.getMonth() : null;
  const recurringYearly = totals.avgPerMonth * 12; // contract size estimate

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/vendors"
        className="inline-flex items-center gap-1 text-[12px] text-steel transition-colors duration-base ease-out hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Back to Vendors
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <EyebrowLabel withRule>
            {KIND_LABEL[vendor.kind] ?? vendor.kind}
            {vendor.division ? ` · ${DIVISION_LABEL[vendor.division] ?? vendor.division}` : ""}
          </EyebrowLabel>
          <h1 className="mt-2 truncate font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            {vendor.name}
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[13.5px] text-steel">
            {vendor.notes
              ? vendor.notes
              : `Recurring monthly + ad-hoc invoices. Last reviewed ${formatDate(vendor.updated_at)}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setVendorEditOpen(true)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Edit
          </Button>
          <YearChip value={year} onChange={setYear} />
        </div>
      </div>

      {/* Main 2-column grid: content + side panel.
          Side panel collapses below the main content under 1100px
          per spec §11 ("320 px column at desktop, drops below the
          main column < 1100 px"). */}
      <div className="grid gap-6 [@media(min-width:1100px)]:grid-cols-[1fr_320px]">
        {/* ── Main column ──────────────────────────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* Recurring monthly grid */}
          <Card className="p-tile-md">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <EyebrowLabel withRule>Recurring monthly · {year}</EyebrowLabel>
                <div className="mt-2 flex items-baseline gap-2">
                  <MoneyCell amount={recurringYearly} size="h2" splitDecimals={false} />
                  <span className="text-[12px] text-steel">/ yr</span>
                  <span className="text-[12px] text-steel">·</span>
                  <span className="text-[12px] text-steel">
                    avg {formatUSD(totals.avgPerMonth, { decimals: 0 })} × 12
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-steel">Click any cell to edit the bill.</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
              {MONTHS.map((label, i) => {
                const month = i + 1;
                const p = paymentByMonth[month];
                const isCurrent = currentMonthIdx === i;
                const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                return (
                  <div key={label} className="space-y-1">
                    <div
                      className={cn(
                        "text-center text-[10px] font-semibold uppercase tracking-[0.13em]",
                        isCurrent ? "text-white" : isFuture ? "text-steel/40" : "text-steel",
                      )}
                    >
                      {label}
                      {isCurrent ? <span className="ml-0.5 text-electric">·</span> : null}
                    </div>
                    {p && p.amount != null ? (
                      <InvoiceCell
                        amount={Number(p.amount) || 0}
                        ref_={p.paid_at ? formatDate(p.paid_at) : "—"}
                        status={p.status}
                        future={isFuture}
                        onClick={() => setEditingCell({ month, existing: p })}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingCell({ month, existing: p ?? null })}
                        className={cn(
                          "block h-[60px] w-full rounded-sm border border-dashed border-rule px-2 py-2 text-center text-[18px] font-semibold leading-none text-steel/30 transition-colors duration-base ease-out hover:bg-white/[0.04] hover:text-steel/60",
                          isFuture && "opacity-50",
                        )}
                        title={`Log ${MONTHS[month - 1]} ${year} payment`}
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Ad-hoc invoices */}
          <Card className="overflow-hidden p-0">
            <div className="flex items-end justify-between gap-3 border-b border-rule px-tile-md py-3.5">
              <div>
                <EyebrowLabel withRule>Ad-hoc invoices</EyebrowLabel>
                <h3 className="mt-1.5 text-[13px] font-semibold tracking-[-0.005em] text-white">
                  One-off bills outside the recurring grid
                </h3>
                <p className="mt-0.5 text-[11px] text-steel">
                  {(invoices?.length ?? 0)} {(invoices?.length ?? 0) === 1 ? "entry" : "entries"} ·{" "}
                  {formatUSD(totals.adhocBilled, { decimals: 0 })} total
                </p>
              </div>
              <Button onClick={() => setCreatingInvoice(true)} size="sm" className="h-8">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add ad-hoc
              </Button>
            </div>
            {(invoices?.length ?? 0) === 0 ? (
              <div className="px-tile-md py-6 text-center text-[12px] text-steel">
                No ad-hoc invoices logged.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="px-tile-md py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                      Description
                    </th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                      Issued
                    </th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                      Due
                    </th>
                    <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                      Amount
                    </th>
                    <th className="px-tile-md py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setEditingInvoice(inv)}
                      className="cursor-pointer border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                    >
                      <td className="px-tile-md py-2.5">
                        <div className="text-[13px] font-medium text-white">{inv.description}</div>
                      </td>
                      <td className="px-2 py-2.5 text-[12px] text-steel">
                        {formatDate(inv.issued_at)}
                      </td>
                      <td className="px-2 py-2.5 text-[12px] text-steel">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <MoneyCell amount={Number(inv.amount) || 0} size="body" splitDecimals={false} />
                      </td>
                      <td className="px-tile-md py-2.5">
                        <StatusPill status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* YTD totals strip — recurring + ad-hoc + outstanding */}
          <YtdStrip totals={totals} />

          {/* Danger zone — the ONE place a destructive button is red, per spec §11 */}
          <Card className="p-tile-md">
            <EyebrowLabel className="text-overdue">Danger zone</EyebrowLabel>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[12px] text-steel">
                Permanent operations on this vendor record.
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8" disabled title="Archive (coming soon)">
                  <Archive className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Archive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  onClick={onDelete}
                  disabled={del.isPending}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Delete vendor
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Side panel (320px on desktop, stacks below otherwise) ── */}
        <aside className="space-y-6">
          {/* Vendor metadata */}
          <Card className="p-tile-md">
            <EyebrowLabel withRule>Counterparty</EyebrowLabel>
            <dl className="mt-4 space-y-3 text-[13px]">
              <MetaRow icon={Wallet} label="Payment method"
                value={vendor.payment_method ? PAYMENT_METHOD_LABEL[vendor.payment_method] : "Unspecified"} />
              {vendor.account_profile ? (
                <MetaRow icon={Calendar} label="Account profile" value={vendor.account_profile} />
              ) : null}
              {vendor.contact_name ? (
                <MetaRow icon={Pencil} label="Contact" value={vendor.contact_name} />
              ) : null}
              {vendor.contact_email ? (
                <MetaRow
                  icon={Mail}
                  label="Email"
                  value={
                    <a
                      href={`mailto:${vendor.contact_email}`}
                      className="text-electric hover:underline"
                    >
                      {vendor.contact_email}
                    </a>
                  }
                />
              ) : null}
              {vendor.contact_phone ? (
                <MetaRow icon={Phone} label="Phone" value={vendor.contact_phone} />
              ) : null}
            </dl>
          </Card>

          {/* R5 Sweep 4: Legal & billing card — kind='vendor' only, and
              only when at least one of the new fields is populated.
              Skipping the card entirely for empty rows avoids visual
              noise on older vendors that pre-date the parity fields. */}
          {vendor.kind === "vendor" &&
          (vendor.legal_name || vendor.business_name || vendor.address) ? (
            <Card className="p-tile-md">
              <EyebrowLabel withRule>Legal &amp; billing</EyebrowLabel>
              <dl className="mt-4 space-y-3 text-[13px]">
                {vendor.legal_name ? (
                  <MetaRow icon={Pencil} label="Legal name" value={vendor.legal_name} />
                ) : null}
                {vendor.business_name ? (
                  <MetaRow icon={Pencil} label="Business" value={vendor.business_name} />
                ) : null}
                {vendor.address ? (
                  <MetaRow icon={Mail} label="Address" value={vendor.address} />
                ) : null}
              </dl>
            </Card>
          ) : null}

          {/* R5 Sweep 4: Signed agreements list — kind='vendor' only.
              Renders the new vendor_agreements rows; each row links
              out to its stored URL with category + label labelling.
              Empty state shows a soft "No agreements yet" prompt. */}
          {vendor.kind === "vendor" ? (
            <Card className="p-tile-md">
              <EyebrowLabel withRule>Signed agreements</EyebrowLabel>
              {(agreements?.length ?? 0) === 0 ? (
                <p className="mt-3 text-[12px] text-steel">
                  No agreements on file. Add them from the Edit dialog.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {(agreements ?? []).map((a) => (
                    <li key={a.id} className="rounded-md border border-rule bg-background/40 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-steel">
                            {a.category}
                          </div>
                          <div className="truncate text-[13px] font-medium text-white">
                            {a.label}
                          </div>
                          {a.signed_at ? (
                            <div className="mt-0.5 text-[11px] text-steel">
                              Signed {formatDate(a.signed_at)}
                            </div>
                          ) : null}
                        </div>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-steel hover:text-electric"
                          title="Open agreement"
                          aria-label={`Open ${a.label}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </a>
                      </div>
                      {a.notes ? (
                        <p className="mt-1 text-[11px] text-steel">{a.notes}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* Recent receipts */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-rule px-tile-md py-3.5">
              <div className="flex items-center justify-between gap-2">
                <EyebrowLabel withRule>Recent receipts</EyebrowLabel>
                <Link
                  to="/payments"
                  className="inline-flex items-center gap-0.5 text-[11px] text-steel hover:text-white"
                >
                  All <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                </Link>
              </div>
              <p className="mt-1 text-[11px] text-steel">
                Last {Math.min(5, receipts?.length ?? 0)} of {receipts?.length ?? 0}
              </p>
            </div>
            {(receipts?.length ?? 0) === 0 ? (
              <div className="px-tile-md py-6 text-center text-[12px] text-steel">
                No receipts logged.
              </div>
            ) : (
              <ul>
                {(receipts ?? []).slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="border-b border-rule px-tile-md py-2.5 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-white">
                          {r.reference || formatDate(r.received_at)}
                        </div>
                        <div className="text-[11px] text-steel">
                          {r.method
                            ? PAYMENT_METHOD_LABEL[r.method] ?? r.method
                            : "—"}{" "}
                          · {formatDate(r.received_at)}
                        </div>
                      </div>
                      <MoneyCell amount={Number(r.amount) || 0} size="body" splitDecimals={false} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      {/* Dialogs */}
      {editingCell && id ? (
        <PaymentCellDialog
          open
          onOpenChange={(o) => !o && setEditingCell(null)}
          vendorId={id}
          year={year}
          month={editingCell.month}
          existing={editingCell.existing}
        />
      ) : null}

      {creatingInvoice && id ? (
        <VendorInvoiceDialog
          open
          onOpenChange={(o) => !o && setCreatingInvoice(false)}
          vendorId={id}
          vendorName={vendor.name}
          invoice={null}
        />
      ) : null}

      {editingInvoice && id ? (
        <VendorInvoiceDialog
          open
          onOpenChange={(o) => !o && setEditingInvoice(null)}
          vendorId={id}
          vendorName={vendor.name}
          invoice={editingInvoice}
        />
      ) : null}

      <VendorDialog
        open={vendorEditOpen}
        onOpenChange={setVendorEditOpen}
        defaultKind={vendor.kind}
        vendor={vendor}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Side-panel metadata row
// ─────────────────────────────────────────────────────────────────────

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-[13px] text-white">{value}</dd>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// YTD totals strip — recurring + ad-hoc combined.
// Per spec §11: 4-cell layout, last cell tinted Electric Blue 6%
// at 30px display weight, others at 22px.
// ─────────────────────────────────────────────────────────────────────

function YtdStrip({
  totals,
}: {
  totals: {
    recurringBilled: number;
    recurringPaid: number;
    adhocBilled: number;
    outstanding: number;
  };
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
      <YtdCell
        label="Recurring billed"
        value={formatUSD(totals.recurringBilled, { decimals: 0 })}
        sub="YTD monthly bills"
      />
      <YtdCell
        label="Recurring paid"
        value={formatUSD(totals.recurringPaid, { decimals: 0 })}
        sub="Cleared receipts"
      />
      <YtdCell
        label="Ad-hoc billed"
        value={formatUSD(totals.adhocBilled, { decimals: 0 })}
        sub="One-off invoices"
      />
      <YtdCell
        label="Outstanding"
        value={formatUSD(totals.outstanding, { decimals: 0 })}
        sub="Recurring + ad-hoc unpaid"
        emphasised
        tone="electric"
      />
    </div>
  );
}

function YtdCell({
  label,
  value,
  sub,
  emphasised,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  emphasised?: boolean;
  tone?: "electric";
}) {
  return (
    <div
      className={cn(
        "border-rule px-tile-md py-3 not-last:border-r",
        tone === "electric" && "bg-[rgba(37,99,235,0.06)]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
        {label}
      </div>
      <div
        className={cn(
          "tabular mt-2 font-display font-extrabold leading-none tracking-[-0.022em] text-white",
          emphasised ? "text-[30px]" : "text-[22px]",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-steel">{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Year selector chip — same recipe as Overview.
// ─────────────────────────────────────────────────────────────────────

function YearChip({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
  return (
    <div className="relative inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[12px] text-white transition-colors duration-base ease-out focus-within:ring-1 focus-within:ring-electric">
      <Calendar className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      <span className="tabular">{value}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-steel" strokeWidth={1.5} />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
