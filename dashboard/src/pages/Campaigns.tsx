import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useSharedYear } from "@/hooks/useSharedYear";
import { useAuth } from "@/auth/AuthProvider";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { CampaignDialog } from "@/components/campaigns/CampaignDialog";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { ExportPDFButton } from "@/components/ui/export-pdf-button";
import {
  PageHeader,
  MetricStrip,
  YearSelector,
  type MetricTile,
} from "@/components/recast";
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
  const canEdit = role === "admin" || role === "accounting" || role === "operator";
  // Round-1 efficiency: year pick persists across pages/sessions.
  const [year, setYear] = useSharedYear();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<CampaignStatusV2 | "all">("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  // Round-1 efficiency: /campaigns?open=<id> (linked from Payments
  // rows + the Overview overdue banner) auto-expands + scrolls to
  // that campaign's card instead of dumping the user at the top of
  // the list to hunt for it.
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open");

  // R5 follow-up: fetch ALL campaigns (no status filter) so the KPI
  // tiles can reflect the full set regardless of which filter is
  // active. The filtered list below is what the body table renders.
  const { data: allCampaigns } = useCampaigns({});
  const { data, isLoading, error } = useCampaigns({
    status: statusFilter === "all" ? undefined : statusFilter,
    search,
  });

  const kpis = React.useMemo<MetricTile[]>(() => {
    const rows = allCampaigns ?? [];
    const byStatus = (s: CampaignStatusV2) => rows.filter((c) => c.status === s).length;
    const overdue = byStatus("overdue");
    const awaiting = byStatus("awaiting_payment");
    const active = byStatus("active");
    return [
      // Round-1 efficiency: tiles drill into the matching status
      // filter instead of being display-only.
      {
        label: "Total campaigns",
        value: String(rows.length),
        sub: rows.length === 0 ? "—" : `${active} active`,
        icon: Megaphone,
        onClick: () => setStatusFilter("all"),
      },
      {
        label: "Active",
        value: String(active),
        sub: rows.length === 0 ? "—" : `${Math.round((active / Math.max(rows.length, 1)) * 100)}% of roster`,
        icon: CheckCircle2,
        tone: active > 0 ? "paid" : "default",
        onClick: () => setStatusFilter("active"),
      },
      {
        label: "Awaiting payment",
        value: String(awaiting),
        sub: awaiting === 0 ? "All settled" : "Chase these",
        icon: Clock,
        tone: awaiting > 0 ? "partial" : "default",
        onClick: () => setStatusFilter("awaiting_payment"),
      },
      {
        label: "Overdue",
        value: String(overdue),
        sub: overdue === 0 ? "Clean" : "Action required",
        icon: AlertTriangle,
        tone: overdue > 0 ? "overdue" : "default",
        onClick: () => setStatusFilter("overdue"),
      },
    ];
  }, [allCampaigns]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Pipeline · Campaigns"
        eyebrow={`Brand deals · ${year}`}
        title="Campaigns"
        description={
          <>
            eFuse / brand campaigns. Per-creator deals (CPM, flat, hybrid)
            with monthly performance tracking.
          </>
        }
        actions={
          <>
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
          </>
        }
      />

      <MetricStrip tiles={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name or brand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "h-8 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
                  active
                    ? "border-electric/40 bg-electric/10 text-electric"
                    : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
                )}
              >
                {f.label}
              </button>
            );
          })}
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
          <CampaignCard
            key={c.id}
            campaign={c}
            year={year}
            canEdit={canEdit}
            defaultExpanded={c.id === openId}
          />
        ))}
      </div>

      {dialogOpen && (
        <CampaignDialog open onOpenChange={(o) => !o && setDialogOpen(false)} campaign={null} />
      )}
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
  { header: "Description", value: (c) => c.description ?? "" },
  { header: "Notes", value: (c) => c.notes ?? "" },
];
