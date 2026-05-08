import * as React from "react";
import { FileText, Loader2, RefreshCw, Trash2, UserCheck, X, Zap } from "lucide-react";
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
import { useConfirm } from "@/hooks/useConfirm";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Scouted and contacted creators who aren't signed to Recast yet. Promote
          to the Roster when a deal is agreed.
        </p>
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
        rows={(data ?? []) as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle="No leads yet"
        emptyHint="Run a Scout session or import a list to populate this page."
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
