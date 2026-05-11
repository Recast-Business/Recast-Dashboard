import * as React from "react";
import { LayoutGrid, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors } from "@/hooks/useVendors";
import { useVendorPaymentsByVendors } from "@/hooks/useVendorPayments";
import { VendorRow } from "@/components/finance/VendorRow";
import { VendorTable } from "@/components/finance/VendorTable";
import { VendorDialog } from "@/components/finance/VendorDialog";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { ExportPDFButton } from "@/components/ui/export-pdf-button";
import { monthlyAmountColumns, type CSVColumn } from "@/lib/export/csv";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { PieCard } from "@/components/analytics/PieCard";
import { groupSum, periodMonthRange } from "@/lib/analytics/group";
import type { Division, Vendor, VendorKind } from "@/types/finance";
import { cn } from "@/lib/utils";

type ViewMode = "cards" | "table";

const VIEW_STORAGE_KEY = "recast.finance.vendorViewMode";

interface Props {
  /** When undefined, lists vendors across all divisions (used by the top-level Vendors tab). */
  division?: Division;
  kind: VendorKind;
  title: string;
  description: string;
  year: number;
  /** Show a division filter dropdown when listing across divisions. */
  showDivisionFilter?: boolean;
}

type DivisionFilter = "all" | "none" | Division;

export function VendorSection({ division, kind, title, description, year, showDivisionFilter }: Props) {
  // When `division` is fixed by the parent, the in-page filter is hidden + ignored.
  // When the section is top-level (no fixed division), this dropdown decides what to query.
  const [divisionFilter, setDivisionFilter] = React.useState<DivisionFilter>("all");

  const queryDivision: Division | null | undefined =
    division ??
    (divisionFilter === "all"
      ? undefined
      : divisionFilter === "none"
      ? null
      : divisionFilter);

  const { data, isLoading, error } = useVendors({ division: queryDivision, kind });
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vendor | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    return (window.localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || "cards";
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((v) =>
      [v.name, v.contact_name, v.contact_email, v.account_profile, v.notes]
        .some((f) => f && f.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const ids = React.useMemo(() => filtered.map((v) => v.id), [filtered]);
  const { data: paymentsByVendor } = useVendorPaymentsByVendors(ids, year);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(v: Vendor) {
    setEditing(v);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-h3">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <ExportCSVButton
            filename={buildExportFilename(kind, division ?? divisionFilter, year)}
            rows={filtered}
            columns={buildVendorCSVColumns(paymentsByVendor ?? {})}
          />
          <ExportPDFButton
            filename={buildExportFilename(kind, division ?? divisionFilter, year).replace(/\.csv$/, ".pdf")}
            title={`${title} — ${year}`}
            subtitle={division ? `Division: ${divisionLabel(division)}` : undefined}
            rows={filtered}
            columns={buildVendorCSVColumns(paymentsByVendor ?? {})}
            orientation="landscape"
          />
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {showDivisionFilter && !division && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Division:</span>
          {(["all", "onlyfans", "telegram", "efuse", "none"] as DivisionFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDivisionFilter(d)}
              className={cn(
                "rounded-md border px-2 py-1 capitalize transition",
                divisionFilter === d ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {d === "all" ? "All" : d === "none" ? "Org-wide" : d === "onlyfans" ? "OnlyFans" : d === "telegram" ? "Telegram" : "Overlay"}
            </button>
          ))}
        </div>
      )}

      <Input
        placeholder="Search by name, contact, profile, notes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
          {data?.length ? "No matches." : "No records yet — click Add to create one."}
        </div>
      )}

      {filtered.length > 0 && (
        <AnalyticsPanel
          storageKey={`recast.analytics.vendors.${kind}.${division ?? "top"}`}
          title="Spend analytics"
        >
          {(period) => {
            const range = periodMonthRange(period);
            // Aggregate every vendor's payments within the selected month range.
            const enriched = filtered.map((v) => {
              const cells = paymentsByVendor?.[v.id] ?? {};
              let amt = 0;
              for (let m = range.from; m <= range.to; m++) {
                amt += Number(cells[m]?.amount) || 0;
              }
              return { vendor: v, amount: amt };
            });
            return (
              <>
                <PieCard
                  title="By payment method"
                  data={groupSum(enriched, {
                    key: (e) => methodLabel(e.vendor.payment_method),
                    value: (e) => e.amount,
                  })}
                />
                <PieCard
                  title="By division"
                  data={groupSum(enriched, {
                    key: (e) => divisionLabel(e.vendor.division),
                    value: (e) => e.amount,
                  })}
                />
                <PieCard
                  title="By counterparty (top 8)"
                  data={groupSum(enriched, {
                    key: (e) => e.vendor.name,
                    value: (e) => e.amount,
                    topN: 8,
                  })}
                />
              </>
            );
          }}
        </AnalyticsPanel>
      )}

      {filtered.length > 0 && viewMode === "cards" && (
        <div className="space-y-2">
          {filtered.map((v) => (
            <VendorRow
              key={v.id}
              vendor={v}
              year={year}
              payments={paymentsByVendor?.[v.id] ?? {}}
              onEdit={() => openEdit(v)}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && viewMode === "table" && (
        <VendorTable
          vendors={filtered}
          paymentsByVendor={paymentsByVendor ?? {}}
          year={year}
          onEdit={openEdit}
        />
      )}

      <VendorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDivision={division}
        defaultKind={kind}
        vendor={editing}
      />
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-muted/30 p-0.5">
      <button
        type="button"
        onClick={() => onChange("cards")}
        title="Card view — expandable rows with banking + 12-month grid"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition",
          value === "cards"
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-3 w-3" /> Cards
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        title="Spreadsheet view — wide table with all 12 months inline"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition",
          value === "table"
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Table2 className="h-3 w-3" /> Table
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CSV export helpers
// ─────────────────────────────────────────────────────────────────────

function methodLabel(m: string | null | undefined): string {
  if (!m) return "Unspecified";
  return PAYMENT_METHOD_LABEL_FULL[m] ?? m;
}

function divisionLabel(d: string | null | undefined): string {
  if (!d) return "Org-wide";
  if (d === "onlyfans") return "OnlyFans";
  if (d === "telegram") return "Telegram";
  if (d === "efuse") return "Overlay";
  return d;
}

const PAYMENT_METHOD_LABEL_FULL: Record<string, string> = {
  auto_pay: "Auto Pay",
  paypal: "PayPal",
  domestic_wire: "Domestic Wire",
  international_transfer: "International Transfer",
  bank_ach: "Bank ACH",
  zelle: "Zelle",
  invoice_link: "Invoice Link",
  website_link: "Website Link",
  credit_card: "Credit Card",
};

function buildExportFilename(
  kind: VendorKind,
  scope: Division | DivisionFilter | undefined,
  year: number,
): string {
  const kindSlug =
    kind === "vendor" ? "vendors"
    : kind === "talent_we_pay" ? "talents-we-pay"
    : kind === "talent_that_pays_us" ? "talents-paying-us"
    : kind === "credit_card_account" ? "credit-cards"
    : kind === "utility" ? "utilities"
    : "employees";
  const scopeSlug =
    !scope || scope === "all"
      ? ""
      : scope === "none"
      ? "-org-wide"
      : `-${scope}`;
  return `${kindSlug}${scopeSlug}-${year}.csv`;
}

function buildVendorCSVColumns(
  paymentsByVendor: Record<string, Record<number, { amount: number | null }>>,
): CSVColumn<Vendor>[] {
  const base: CSVColumn<Vendor>[] = [
    { header: "Name", value: (v) => v.name },
    { header: "Division", value: (v) => v.division ?? "Org-wide" },
    {
      header: "Payment method",
      value: (v) => (v.payment_method ? PAYMENT_METHOD_LABEL_FULL[v.payment_method] : ""),
    },
    { header: "Account profile", value: (v) => v.account_profile ?? "" },
    { header: "Contact name", value: (v) => v.contact_name ?? "" },
    { header: "Contact email", value: (v) => v.contact_email ?? "" },
    { header: "Contact phone", value: (v) => v.contact_phone ?? "" },
    { header: "Active", value: (v) => (v.active ? "yes" : "no") },
    { header: "Notes", value: (v) => v.notes ?? "" },
  ];
  const monthly = monthlyAmountColumns<Vendor>((v, month) => {
    const cell = paymentsByVendor[v.id]?.[month];
    return cell?.amount ?? null;
  });
  return [...base, ...monthly];
}
