import * as React from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ExternalLink,
  Home as HomeIcon,
  Megaphone,
  Plus,
  Receipt,
  Search,
  Store,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EyebrowLabel, MetricStrip, MoneyCell } from "@/components/recast";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import {
  useAllPaymentReceipts,
  type ReceiptWithJoins,
} from "@/hooks/usePaymentReceipts";
import { LogPaymentDialog } from "@/components/finance/LogPaymentDialog";
import type { PaymentSource } from "@/types/finance";
import { cn, formatUSD, formatDate } from "@/lib/utils";

/**
 * R5 Sweep 5 — Unified payments log.
 *
 * One table across every payment receipt Recast has logged this year,
 * sourced from payment_receipts. The actual obligation-paydown
 * arithmetic lives server-side (allocate_fifo / allocate_specific
 * RPCs); this page is the read+create surface.
 *
 * Default view per user spec: current year, all sources mixed, paid
 * (receipts are by definition paid — every row in payment_receipts is
 * a confirmed money-moved event). The "status" concept doesn't apply
 * at the receipt level; what varies is whether the receipt has been
 * allocated (it always is, FIFO by default).
 *
 * Filters:
 *   • Year selector (default current year)
 *   • Source kind multi-select (vendor / campaign / talent / house)
 *   • Search across payee name + reference
 *
 * Actions:
 *   • + Log payment — opens LogPaymentDialog (R5 Sweep 5 C2). The
 *     dialog lets the user pick source + obligor + amount + allocation
 *     mode (FIFO or specific months) in one place.
 */

// ─────────────────────────────────────────────────────────────────────
// Source metadata
// ─────────────────────────────────────────────────────────────────────

const SOURCE_META: Record<
  PaymentSource,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
    chipClass: string;
  }
> = {
  vendor: {
    label: "Vendor",
    icon: Store,
    chipClass: "bg-electric/10 text-electric",
  },
  campaign: {
    label: "Campaign",
    icon: Megaphone,
    chipClass: "bg-partial-tint text-partial",
  },
  telegram: {
    label: "Telegram",
    icon: Users,
    chipClass: "bg-paid-tint text-paid",
  },
  onlyfans: {
    label: "OnlyFans",
    icon: Users,
    chipClass: "bg-paid-tint text-paid",
  },
  house_rent: {
    label: "House rent",
    icon: HomeIcon,
    chipClass: "bg-overdue-tint text-overdue",
  },
  house_utility: {
    label: "Utility",
    icon: Zap,
    chipClass: "bg-overdue-tint text-overdue",
  },
};

const SOURCE_FILTER_GROUPS: { value: PaymentSource[]; label: string }[] = [
  { value: ["vendor"], label: "Vendors" },
  { value: ["campaign"], label: "Campaigns" },
  { value: ["telegram", "onlyfans"], label: "Talent (Tele + OF)" },
  { value: ["house_rent", "house_utility"], label: "House" },
];

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [activeGroups, setActiveGroups] = React.useState<Set<string>>(
    new Set(SOURCE_FILTER_GROUPS.map((g) => g.label)),
  );
  const [search, setSearch] = React.useState("");
  const [logOpen, setLogOpen] = React.useState(false);

  // Flatten the active groups back to a flat PaymentSource[] for the
  // server query. Empty = no filter (show all).
  const activeSources: PaymentSource[] = React.useMemo(() => {
    if (activeGroups.size === SOURCE_FILTER_GROUPS.length) return [];
    const out: PaymentSource[] = [];
    for (const g of SOURCE_FILTER_GROUPS) {
      if (activeGroups.has(g.label)) out.push(...g.value);
    }
    return out;
  }, [activeGroups]);

  const { data: receipts, isLoading } = useAllPaymentReceipts({
    year,
    sources: activeSources.length > 0 ? activeSources : undefined,
  });

  // Client-side search across payee name + reference.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts ?? [];
    return (receipts ?? []).filter((r) => {
      const payee = resolvePayeeName(r).toLowerCase();
      const ref = (r.reference ?? "").toLowerCase();
      return payee.includes(q) || ref.includes(q);
    });
  }, [receipts, search]);

  const totalAmount = React.useMemo(
    () => filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [filtered],
  );

  function toggleGroup(label: string) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // CSV columns kept light — full receipt details live on the source
  // detail page (vendor/talent/house). This is the audit-trail export.
  const csvRows = React.useMemo(
    () =>
      filtered.map((r) => ({
        date: r.received_at,
        source: SOURCE_META[r.source].label,
        payee: resolvePayeeName(r),
        amount: String(Number(r.amount) || 0),
        method: r.method ?? "",
        reference: r.reference ?? "",
        allocations: r.allocations
          .map((a) => `${a.period_year}-${String(a.period_month).padStart(2, "0")}: ${a.amount}`)
          .join(" | "),
        notes: r.notes ?? "",
      })),
    [filtered],
  );

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div>
        <EyebrowLabel withRule>Ledgers · Payments</EyebrowLabel>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">
              Payments
            </h1>
            <p className="mt-1 max-w-[80ch] text-[13px] text-steel">
              Every payment Recast logged this year — vendors, campaign
              creators, talent earnings, and Frazier's House. Click a
              row to jump to the obligor's full history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <YearPicker year={year} onChange={setYear} />
            <Button
              size="sm"
              onClick={() => setLogOpen(true)}
              className="h-8 text-[12px]"
            >
              <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
              Log payment
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────── */}
      <MetricStrip
        tiles={[
          {
            label: "Receipts logged",
            value: String(filtered.length),
            sub: `${year}`,
            icon: Receipt,
          },
          {
            label: "Total moved",
            value: formatUSD(totalAmount, { decimals: 0 }),
            sub:
              filtered.length > 0
                ? `Avg ${formatUSD(totalAmount / filtered.length, { decimals: 0 })}`
                : "—",
            icon: Wallet,
            tone: "paid",
          },
          {
            label: "Allocated",
            value: String(
              filtered.reduce((n, r) => n + r.allocations.length, 0),
            ),
            sub: "period rows touched",
            icon: ChevronRight,
          },
          {
            label: "Filtered out",
            value: String((receipts?.length ?? 0) - filtered.length),
            sub: search.trim()
              ? `Search: "${search.trim()}"`
              : "Source filters",
            icon: Search,
          },
        ]}
      />

      {/* ── Filter row ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Search payee or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[280px] rounded-md bg-card pl-8 text-[13px] placeholder:text-steel"
          />
        </div>
        <div className="flex items-center gap-1">
          {SOURCE_FILTER_GROUPS.map((g) => {
            const active = activeGroups.has(g.label);
            return (
              <button
                key={g.label}
                type="button"
                onClick={() => toggleGroup(g.label)}
                className={cn(
                  "h-8 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
                  active
                    ? "border-electric/40 bg-electric/10 text-electric"
                    : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
                )}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto flex items-center gap-2 text-[12px] text-steel">
          {filtered.length} {filtered.length === 1 ? "receipt" : "receipts"}
          <ExportCSVButton
            filename={`recast-payments-${year}.csv`}
            rows={csvRows}
            label="Export CSV"
            disabled={csvRows.length === 0}
            columns={[
              { header: "Date", value: (r) => r.date },
              { header: "Source", value: (r) => r.source },
              { header: "Payee", value: (r) => r.payee },
              { header: "Amount", value: (r) => r.amount },
              { header: "Method", value: (r) => r.method },
              { header: "Reference", value: (r) => r.reference },
              { header: "Allocations", value: (r) => r.allocations },
              { header: "Notes", value: (r) => r.notes },
            ]}
          />
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-lg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-[13px] text-steel">
          {(receipts?.length ?? 0) === 0
            ? `No payment receipts logged for ${year} yet. Click "Log payment" to add the first one.`
            : "No matches for the current filter."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  <Th>Date</Th>
                  <Th>Source</Th>
                  <Th>Payee</Th>
                  <Th right>Amount</Th>
                  <Th>Method</Th>
                  <Th>Reference</Th>
                  <Th>Allocations</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <ReceiptRow key={r.id} receipt={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LogPaymentDialog open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────

function ReceiptRow({ receipt }: { receipt: ReceiptWithJoins }) {
  const meta = SOURCE_META[receipt.source];
  const Icon = meta.icon;
  const payee = resolvePayeeName(receipt);
  const link = resolvePayeeLink(receipt);
  const allocSummary = summariseAllocations(receipt);

  return (
    <tr className="group border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]">
      <td className="px-3 py-2.5 align-top text-[12px] text-white tabular">
        {formatDate(receipt.received_at)}
      </td>
      <td className="px-3 py-2.5 align-top">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
            meta.chipClass,
          )}
        >
          <Icon className="h-2.5 w-2.5" strokeWidth={2} />
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-white">
        {link ? (
          <Link
            to={link}
            className="inline-flex items-center gap-1 hover:text-electric hover:underline"
            title={`Open ${payee}`}
          >
            {payee}
            <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
          </Link>
        ) : (
          payee
        )}
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <MoneyCell amount={Number(receipt.amount) || 0} size="body" splitDecimals={false} />
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-steel">
        {receipt.method ?? "—"}
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-steel">
        <div className="max-w-[180px] truncate" title={receipt.reference ?? ""}>
          {receipt.reference ?? "—"}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-steel">
        {allocSummary}
      </td>
      <td className="px-3 py-2.5 align-top">
        {receipt.notes ? (
          <span
            className="cursor-help text-[11px] text-steel underline decoration-dotted"
            title={receipt.notes}
          >
            note
          </span>
        ) : null}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function resolvePayeeName(r: ReceiptWithJoins): string {
  switch (r.source) {
    case "vendor":
      return r.vendor?.name ?? "(unknown vendor)";
    case "telegram":
      return r.creator?.name ?? "(unknown creator)";
    case "onlyfans":
      return r.of_deal?.creator?.name
        ? `${r.of_deal.creator.name} · ${r.of_deal.page_name}`
        : r.of_deal?.page_name ?? "(unknown OF deal)";
    case "campaign":
      return r.campaign_creator?.creator?.name && r.campaign_creator?.campaign?.name
        ? `${r.campaign_creator.creator.name} · ${r.campaign_creator.campaign.name}`
        : r.campaign_creator?.creator?.name ?? "(unknown campaign)";
    case "house_rent":
      return r.resident?.name ?? "(unknown resident)";
    case "house_utility":
      return r.utility?.utility_name ?? "(unknown utility)";
    default:
      return "—";
  }
}

function resolvePayeeLink(r: ReceiptWithJoins): string | null {
  switch (r.source) {
    case "vendor":
      return r.vendor ? `/vendors/${r.vendor.id}` : null;
    case "telegram":
    case "onlyfans":
      const creatorId = r.creator?.id ?? r.of_deal?.creator?.id;
      return creatorId ? `/talents/${creatorId}` : null;
    case "campaign":
      return r.campaign_creator?.campaign
        ? `/campaigns?open=${r.campaign_creator.campaign.id}`
        : null;
    case "house_rent":
    case "house_utility":
      return "/house";
    default:
      return null;
  }
}

/**
 * Compact allocation summary: "Aug + Sep 2025" or "Aug 2025" or
 * "3 months" depending on count. Full breakdown lives in the obligor
 * detail page (vendor monthly grid, talent ledger, etc.).
 */
function summariseAllocations(r: ReceiptWithJoins): string {
  const a = r.allocations ?? [];
  if (a.length === 0) return "unallocated";
  if (a.length === 1) {
    const x = a[0];
    return `${monthAbbrev(x.period_month)} ${x.period_year}`;
  }
  if (a.length === 2) {
    const [x, y] = a;
    if (x.period_year === y.period_year) {
      return `${monthAbbrev(x.period_month)} + ${monthAbbrev(y.period_month)} ${x.period_year}`;
    }
    return `${monthAbbrev(x.period_month)} ${x.period_year} + ${monthAbbrev(y.period_month)} ${y.period_year}`;
  }
  return `${a.length} months`;
}

function monthAbbrev(m: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Math.max(1, Math.min(12, m)) - 1
  ];
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-steel",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

// R5 follow-up: local KpiTile removed — consolidated onto
// `MetricStrip` / `MetricTile` from @/components/recast.

function YearPicker({
  year,
  onChange,
}: {
  year: number;
  onChange: (y: number) => void;
}) {
  const current = new Date().getFullYear();
  // Show 4 years: current + 3 prior.
  const years = [0, 1, 2, 3].map((d) => current - d);
  return (
    <select
      value={year}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 rounded-md border border-rule bg-card px-2.5 text-[12px] text-white"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
