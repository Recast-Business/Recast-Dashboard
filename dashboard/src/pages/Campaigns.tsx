import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAuth } from "@/auth/AuthProvider";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { CampaignDialog } from "@/components/campaigns/CampaignDialog";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { ExportPDFButton } from "@/components/ui/export-pdf-button";
import type { CSVColumn } from "@/lib/export/csv";
import type { CampaignStatusV2, CampaignV2 } from "@/types/finance";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { value: CampaignStatusV2 | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "awaiting_payment", label: "Awaiting" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

export function CampaignsPage() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "finance";
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<CampaignStatusV2 | "all">("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading, error } = useCampaigns({
    status: statusFilter === "all" ? undefined : statusFilter,
    search,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h2">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            eFuse / brand campaigns. Per-creator deals (CPM, flat, hybrid) with
            monthly performance tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <YearSelector value={year} onChange={setYear} />
          <ExportCSVButton
            filename={`campaigns-${year}.csv`}
            rows={data ?? []}
            columns={CAMPAIGN_CSV_COLUMNS}
          />
          <ExportPDFButton
            filename={`campaigns-${year}.pdf`}
            title={`Campaigns — ${year}`}
            rows={data ?? []}
            columns={CAMPAIGN_CSV_COLUMNS}
            orientation="landscape"
          />
          {canEdit && (
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <Plus className="mr-1 h-4 w-4" /> New campaign
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name or brand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition",
                statusFilter === f.value
                  ? "bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {search || statusFilter !== "all"
            ? "No campaigns match the current filters."
            : "No campaigns yet — click New campaign to create one."}
        </div>
      )}

      <div className="space-y-2">
        {(data ?? []).map((c) => (
          <CampaignCard key={c.id} campaign={c} year={year} canEdit={canEdit} />
        ))}
      </div>

      {dialogOpen && (
        <CampaignDialog open onOpenChange={(o) => !o && setDialogOpen(false)} campaign={null} />
      )}
    </div>
  );
}

function YearSelector({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Year:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border bg-background px-2 py-1 text-sm"
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

const CAMPAIGN_CSV_COLUMNS: CSVColumn<CampaignV2>[] = [
  { header: "Brand", value: (c) => c.brand },
  { header: "Campaign", value: (c) => c.name },
  { header: "Type", value: (c) => c.campaign_type ?? "" },
  { header: "Status", value: (c) => c.status },
  { header: "Default commission %", value: (c) => c.default_commission_pct },
  { header: "Start date", value: (c) => c.start_date ?? "" },
  { header: "End date", value: (c) => c.end_date ?? "" },
  { header: "Ad overlay", value: (c) => (c.is_ad_overlay ? "yes" : "no") },
  { header: "Description", value: (c) => c.description ?? "" },
  { header: "Notes", value: (c) => c.notes ?? "" },
];
