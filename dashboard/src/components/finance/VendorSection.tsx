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
import type { Division, Vendor, VendorKind } from "@/types/finance";
import { cn } from "@/lib/utils";

type ViewMode = "cards" | "table";

const VIEW_STORAGE_KEY = "recast.finance.vendorViewMode";

interface Props {
  division: Division;
  kind: VendorKind;
  title: string;
  description: string;
  year: number;
}

export function VendorSection({ division, kind, title, description, year }: Props) {
  const { data, isLoading, error } = useVendors({ division, kind });
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
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

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
