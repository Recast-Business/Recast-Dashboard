import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendors } from "@/hooks/useVendors";
import { useVendorPaymentsByVendors } from "@/hooks/useVendorPayments";
import { VendorRow } from "@/components/finance/VendorRow";
import { VendorDialog } from "@/components/finance/VendorDialog";
import type { Division, Vendor, VendorKind } from "@/types/finance";

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
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
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
