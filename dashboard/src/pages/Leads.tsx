import * as React from "react";
import {
  Activity,
  CalendarClock,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Trash2,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreatorTable, type CreatorRow } from "@/components/roster/CreatorTable";
import { AddCreatorDialog } from "@/components/roster/AddCreatorDialog";
import { GenerateBriefDialog } from "@/components/leads/GenerateBriefDialog";
import {
  useCreators,
  useSetCreatorSigned,
  useBackfillCCVFromSheet,
  useFetchAllTwitchCCV,
  useBulkDeleteCreators,
  useBulkSign,
  useBulkSetOutreachStatus,
} from "@/hooks/useCreators";
import { useAuth } from "@/auth/AuthProvider";
import {
  PageHeader,
  MetricStrip,
  type MetricTile,
} from "@/components/recast";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";

const OUTREACH_STATUSES = [
  "Not Contacted",
  "Outreached",
  "Responded",
  "Interested",
  "In Progress",
  "Signed",
  "Not Interested",
  "Pass",
  "On Hold",
];

export function LeadsPage() {
  const { role } = useAuth();
  const canEdit = role !== "partner";
  const isAdmin = role === "admin";
  const { data, isLoading, error } = useCreators("unsigned");
  const setSigned = useSetCreatorSigned();
  const backfill = useBackfillCCVFromSheet();
  const fetchAll = useFetchAllTwitchCCV();
  const bulkSign = useBulkSign();
  const bulkDelete = useBulkDeleteCreators();
  const bulkStatus = useBulkSetOutreachStatus();
  const confirm = useConfirm();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pendingStatus, setPendingStatus] = React.useState<string>("");
  const [briefOpen, setBriefOpen] = React.useState(false);
  // R5 follow-up: outreach status filter for the chip row. "all" =
  // no filter, OUTREACH_NEEDED = a virtual bucket meaning the lead has
  // no outreach_status set yet OR is explicitly "Not Contacted".
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // ────────────────────────────────────────────────────────────
  // R5 follow-up — KPI rollups + outreach-status bucketing.
  // ────────────────────────────────────────────────────────────
  // Buckets used by the chip row + the awaiting-outreach KPI tile.
  // "responded" pulls anything where a human has had a back-and-forth
  // (the next-best signal we'd otherwise have to read row-by-row).
  const AWAITING_STATUSES = new Set(["Not Contacted"]);
  const RESPONDED_STATUSES = new Set(["Responded", "Interested", "In Progress"]);

  const rows = data ?? [];
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    m.set("all", rows.length);
    let awaiting = 0;
    for (const c of rows) {
      const s = c.outreach_status ?? "Not Contacted";
      m.set(s, (m.get(s) ?? 0) + 1);
      if (!c.outreach_status || AWAITING_STATUSES.has(c.outreach_status)) {
        awaiting++;
      }
    }
    m.set("__awaiting__", awaiting);
    return m;
  }, [rows]);

  const newThisWeek = React.useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return rows.filter((c) => {
      if (!c.created_at) return false;
      return new Date(c.created_at).getTime() >= cutoff;
    }).length;
  }, [rows]);

  const avgCCV = React.useMemo(() => {
    const ccvs = rows
      .map((c) => Math.max(c.twitch_30d_ccv ?? 0, c.kick_30d_ccv ?? 0))
      .filter((n) => n > 0);
    if (ccvs.length === 0) return 0;
    return Math.round(ccvs.reduce((s, n) => s + n, 0) / ccvs.length);
  }, [rows]);

  const responded = React.useMemo(
    () => rows.filter((c) => RESPONDED_STATUSES.has(c.outreach_status ?? "")).length,
    [rows],
  );

  const kpis: MetricTile[] = [
    {
      label: "Total leads",
      value: String(rows.length),
      sub: rows.length === 0 ? "—" : `${newThisWeek} new this week`,
      icon: Users,
    },
    {
      label: "Awaiting outreach",
      value: String(counts.get("__awaiting__") ?? 0),
      sub: (counts.get("__awaiting__") ?? 0) === 0 ? "All contacted" : "Action: outreach",
      icon: CalendarClock,
      tone: (counts.get("__awaiting__") ?? 0) > 0 ? "partial" : "default",
    },
    {
      label: "Responded",
      value: String(responded),
      sub: rows.length === 0 ? "—" : `${Math.round((responded / Math.max(rows.length, 1)) * 100)}% response rate`,
      icon: MessageCircle,
      tone: responded > 0 ? "paid" : "default",
    },
    {
      label: "Avg CCV",
      value: avgCCV === 0 ? "—" : avgCCV.toLocaleString(),
      sub: avgCCV === 0 ? "No CCV data" : "30-day average",
      icon: Activity,
    },
  ];

  // Status chips render the canonical statuses + an "Awaiting" virtual
  // bucket. Statuses with zero rows are hidden to keep the chip row
  // tight on small lead lists.
  const STATUS_CHIPS: { value: string; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.get("all") ?? 0 },
    {
      value: "__awaiting__",
      label: "Awaiting",
      count: counts.get("__awaiting__") ?? 0,
    },
    ...OUTREACH_STATUSES.map((s) => ({
      value: s,
      label: s,
      count: counts.get(s) ?? 0,
    })).filter((c) => c.value === "Not Contacted" || c.count > 0),
  ];

  const filteredRows = React.useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "__awaiting__") {
      return rows.filter(
        (c) => !c.outreach_status || AWAITING_STATUSES.has(c.outreach_status),
      );
    }
    return rows.filter((c) => c.outreach_status === statusFilter);
  }, [rows, statusFilter]);

  const selectedCreators = React.useMemo(
    () => (data ?? []).filter((c) => selected.has(c.id)),
    [data, selected],
  );

  async function onBackfill() {
    try {
      const result = await backfill.mutateAsync();
      toast.success("Sheet synced", {
        description: `Matched ${result.matched}/${result.total}. Updated ${result.updated}. ${result.missed} unmatched.`,
      });
    } catch (e) {
      toast.error(`Sheet sync failed: ${(e as Error).message}`);
    }
  }

  async function onFetchAll(onlyMissing: boolean) {
    const all = (data ?? []).filter((c) => !!c.twitch_handle);
    const targets = onlyMissing
      ? all.filter((c) => c.twitch_30d_ccv == null || c.twitch_30d_ccv === 0)
      : all;

    if (targets.length === 0) {
      toast.info(
        onlyMissing
          ? "No leads with Twitch handles are missing CCV values."
          : "No leads with Twitch handles to fetch.",
      );
      return;
    }
    const ok = await confirm({
      title: `Fetch CCV for ${targets.length} ${targets.length === 1 ? "lead" : "leads"}?`,
      description: (
        <>
          Pulls live 30-day CCV from TwitchTracker (1-2 minutes — one API
          call per creator).
          <br />
          Existing values are kept if TwitchTracker returns 0 or no data.
        </>
      ),
      confirmLabel: "Fetch",
    });
    if (!ok) return;
    try {
      const result = await fetchAll.mutateAsync({
        creators: targets.map((c) => ({
          id: c.id,
          name: c.name,
          twitch_handle: c.twitch_handle,
          twitch_30d_ccv: c.twitch_30d_ccv,
        })),
        onlyMissing,
      });
      toast.success(`Fetch ${onlyMissing ? "Missing" : "All"} complete`, {
        description: `Updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed} of ${result.attempted}.`,
      });
    } catch (e) {
      toast.error(`Fetch failed: ${(e as Error).message}`);
    }
  }

  async function onBulkSign() {
    if (!selected.size) return;
    const ok = await confirm({
      title: `Sign ${selected.size} ${selected.size === 1 ? "lead" : "leads"} to the Roster?`,
      description: "Selected leads will move from Leads to Roster and be flagged as signed.",
      confirmLabel: "Sign",
    });
    if (!ok) return;
    await bulkSign.mutateAsync([...selected]);
    setSelected(new Set());
  }

  async function onBulkDelete() {
    if (!selected.size) return;
    const ok = await confirm({
      title: `Delete ${selected.size} ${selected.size === 1 ? "lead" : "leads"}?`,
      description: "This permanently removes them from the dashboard and the Google Sheet. Cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await bulkDelete.mutateAsync([...selected]);
    setSelected(new Set());
  }

  async function onBulkSetStatus() {
    if (!selected.size || !pendingStatus) return;
    await bulkStatus.mutateAsync({
      ids: [...selected],
      status: pendingStatus,
    });
    setSelected(new Set());
    setPendingStatus("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Pipeline · Leads"
        eyebrow="Outreach + unsigned"
        title="Leads"
        description={
          <>
            Scouted and contacted creators who aren&apos;t signed to Recast
            yet. Promote to the Roster when a deal is agreed.
          </>
        }
      />

      <MetricStrip tiles={kpis} />

      {/* R5 follow-up — outreach status chip row. Acts as both a
          breakdown view and a single-select filter. "All" + "Awaiting"
          are always visible; canonical statuses appear once they have
          a row, with the Not Contacted bucket pinned even at zero so
          the filter can be reset from any other state. */}
      <div className="flex flex-wrap items-center gap-1">
        {STATUS_CHIPS.map((c) => {
          const active = statusFilter === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setStatusFilter(c.value)}
              className={cn(
                "h-8 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
                active
                  ? "border-electric/40 bg-electric/10 text-electric"
                  : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
              )}
            >
              {c.label}
              <span className="tabular ml-1.5 text-[10px] text-steel/80">
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="sticky top-2 z-20 flex items-center gap-2 rounded-md border bg-background/95 p-2 text-sm shadow-md backdrop-blur">
          <span className="font-medium">
            {selected.size} selected
          </span>
          <Select value={pendingStatus} onValueChange={setPendingStatus}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Set outreach status…" />
            </SelectTrigger>
            <SelectContent>
              {OUTREACH_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pendingStatus || bulkStatus.isPending}
            onClick={onBulkSetStatus}
          >
            Apply status
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulkSign.isPending}
            onClick={onBulkSign}
          >
            <UserCheck className="mr-1 h-3.5 w-3.5" /> Sign to Roster
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={bulkDelete.isPending}
            onClick={onBulkDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => setBriefOpen(true)}
          >
            <FileText className="mr-1 h-3.5 w-3.5" /> Generate Brief
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear selection
          </Button>
        </div>
      )}

      <GenerateBriefDialog
        open={briefOpen}
        onOpenChange={setBriefOpen}
        creators={selectedCreators as CreatorRow[]}
      />

      <CreatorTable
        rows={filteredRows as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle={statusFilter === "all" ? "No leads yet" : "No matches for this filter"}
        emptyHint={
          statusFilter === "all"
            ? "Run a Scout session or import a list to populate this page."
            : 'Pick "All" from the chip row to see every lead again.'
        }
        toolbarExtras={
          canEdit ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onBackfill}
                    disabled={backfill.isPending}
                    title="Pull 30-day CCV values from the Google Sheet"
                  >
                    {backfill.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    )}
                    Sync from Sheet
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onFetchAll(true)}
                    disabled={fetchAll.isPending}
                    title="Fetch Twitch CCV for leads currently showing 0 or no value"
                  >
                    {fetchAll.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="mr-1 h-3.5 w-3.5" />
                    )}
                    Fetch Missing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onFetchAll(false)}
                    disabled={fetchAll.isPending}
                    title="Refresh Twitch CCV for every Lead"
                  >
                    {fetchAll.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="mr-1 h-3.5 w-3.5" />
                    )}
                    Fetch All 30d
                  </Button>
                </>
              )}
              <AddCreatorDialog signed={false} />
            </div>
          ) : null
        }
        hideColumns={["category", "status"]}
        showCCV
        showPlatformFilter
        showAdvancedFilters
        showStar
        defaultSort={{ field: "ccv", dir: "desc" }}
        canEdit={canEdit}
        selection={
          isAdmin ? { selected, onChange: setSelected } : undefined
        }
        rowAction={
          canEdit
            ? (c) => (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={setSigned.isPending}
                  onClick={() => setSigned.mutate({ id: c.id, signed: true })}
                >
                  <UserCheck className="mr-1 h-3 w-3" /> Sign to Roster
                </Button>
              )
            : undefined
        }
      />
    </div>
  );
}
