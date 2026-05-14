import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  IdCard,
  Pencil,
  Star,
  Trash2,
  TrendingUp,
  Users,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreatorTable, type CreatorRow } from "@/components/roster/CreatorTable";
import { AddCreatorDialog } from "@/components/roster/AddCreatorDialog";
import { CreatorProfileDialog } from "@/components/roster/CreatorProfileDialog";
import {
  useBulkDeleteCreators,
  useCreators,
  useSetCreatorSigned,
  useUpdateContractTerms,
} from "@/hooks/useCreators";
import { useRosterEarningsYTD } from "@/hooks/useRosterEarningsYTD";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/auth/AuthProvider";
import {
  PageHeader,
  MetricStrip,
  type MetricTile,
} from "@/components/recast";
import { cn, formatUSD } from "@/lib/utils";

export function RosterPage() {
  const { role } = useAuth();
  const canEdit = role === "admin";
  const currentYear = new Date().getFullYear();
  const { data, isLoading, error } = useCreators("signed");
  // R5 follow-up: batched YTD gross per creator, one Map<id, $> for
  // O(1) lookup inside the YTD column cell.
  const { data: earningsYTD } = useRosterEarningsYTD(currentYear);
  const [editTarget, setEditTarget] = React.useState<CreatorRow | null>(null);
  const [profileTarget, setProfileTarget] = React.useState<CreatorRow | null>(null);
  const [tierFilter, setTierFilter] = React.useState<string>("all");
  const setSigned = useSetCreatorSigned();
  const del = useBulkDeleteCreators();
  const confirm = useConfirm();

  // ────────────────────────────────────────────────────────────
  // R5 follow-up — KPI rollups + tier chip data + filtered rows.
  // ────────────────────────────────────────────────────────────
  const rows = data ?? [];

  const tierCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    m.set("all", rows.length);
    for (const c of rows) {
      const t = c.tier?.trim() || "—";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const missingContract = React.useMemo(
    () => rows.filter((c) => !c.contract_terms || !c.contract_terms.trim()).length,
    [rows],
  );

  const ytdTotal = React.useMemo(() => {
    if (!earningsYTD) return 0;
    let sum = 0;
    for (const c of rows) sum += earningsYTD.get(c.id) ?? 0;
    return sum;
  }, [rows, earningsYTD]);

  const earningCount = React.useMemo(() => {
    if (!earningsYTD) return 0;
    return rows.filter((c) => (earningsYTD.get(c.id) ?? 0) > 0).length;
  }, [rows, earningsYTD]);

  const kpis: MetricTile[] = [
    {
      label: "Total signed",
      value: String(rows.length),
      sub: rows.length === 0 ? "—" : `${earningCount} earning YTD`,
      icon: Users,
    },
    {
      label: "YTD gross billed",
      value: formatUSD(ytdTotal, { decimals: 0 }),
      sub:
        earningCount === 0
          ? "No revenue logged"
          : `Avg ${formatUSD(ytdTotal / Math.max(earningCount, 1), { decimals: 0 })}/creator`,
      icon: TrendingUp,
      tone: ytdTotal > 0 ? "paid" : "default",
    },
    {
      label: "Missing contract",
      value: String(missingContract),
      sub:
        missingContract === 0
          ? "All on file"
          : `${missingContract} need terms`,
      icon: AlertTriangle,
      tone: missingContract > 0 ? "partial" : "default",
    },
    {
      label: "Top tier",
      value: (() => {
        let best: { label: string; count: number } | null = null;
        for (const [label, count] of tierCounts) {
          if (label === "all" || label === "—") continue;
          if (!best || count > best.count) best = { label, count };
        }
        return best ? best.label : "—";
      })(),
      sub: (() => {
        let best: { label: string; count: number } | null = null;
        for (const [label, count] of tierCounts) {
          if (label === "all" || label === "—") continue;
          if (!best || count > best.count) best = { label, count };
        }
        return best ? `${best.count} creators` : "No tier data";
      })(),
      icon: Star,
    },
  ];

  // Tier chip row. Always show All; otherwise only show tier values
  // that actually have rows so we don't render dead chips.
  const tierChips = [
    { value: "all", label: "All", count: rows.length },
    ...Array.from(tierCounts.entries())
      .filter(([label]) => label !== "all")
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        value: label,
        label: label === "—" ? "No tier" : label,
        count,
      })),
  ];

  const filteredRows = React.useMemo(() => {
    if (tierFilter === "all") return rows;
    if (tierFilter === "—") return rows.filter((c) => !c.tier?.trim());
    return rows.filter((c) => c.tier === tierFilter);
  }, [rows, tierFilter]);

  // Phase M-7: when a creator is added via AddCreatorDialog we capture
  // the new id, and as soon as the creators query refetches with that
  // row present we auto-open their profile dialog. This lets Gustavo
  // create + fully configure a creator (commission tiers, contact info,
  // tax ID, payment method) in one flow without hunting for the Profile
  // button afterward.
  const [pendingProfileId, setPendingProfileId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!pendingProfileId || !data) return;
    const created = data.find((c) => c.id === pendingProfileId);
    if (created) {
      setProfileTarget(created as CreatorRow);
      setPendingProfileId(null);
    }
  }, [pendingProfileId, data]);

  async function onUnsign(c: CreatorRow) {
    const ok = await confirm({
      title: `Move ${c.name} back to Leads?`,
      description: "Unsigning keeps the creator's profile but moves them out of the Roster.",
      confirmLabel: "Unsign",
    });
    if (!ok) return;
    try {
      await setSigned.mutateAsync({ id: c.id, signed: false });
      toast.success(`${c.name} moved back to Leads`);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  }

  async function onDelete(c: CreatorRow) {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description:
        "Permanently removes the creator from the Roster, the dashboard, and the master Google Sheet. Cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync([c.id]);
      toast.success(`${c.name} deleted`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Pipeline · Roster"
        eyebrow="Signed creators"
        title="Roster"
        description={
          <>
            Creators signed to Recast. These appear in Campaigns and Briefs
            by default. Click any name to open the full creator profile.
          </>
        }
      />

      <MetricStrip tiles={kpis} />

      {/* R5 follow-up — tier filter chip row. Renders the canonical
          "All" chip plus every tier currently in the data, sorted by
          population. Single-select; "—" maps to the no-tier bucket. */}
      <div className="flex flex-wrap items-center gap-1">
        {tierChips.map((c) => {
          const active = tierFilter === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setTierFilter(c.value)}
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
        {rows.length > 0 ? (
          <span className="ml-auto flex items-center gap-1 text-[12px] text-steel">
            <Users className="h-3 w-3" strokeWidth={1.5} />
            {filteredRows.length} shown
          </span>
        ) : null}
      </div>

      <CreatorTable
        rows={filteredRows as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle={
          tierFilter === "all"
            ? "No signed creators yet"
            : "No creators in this tier"
        }
        emptyHint={
          tierFilter === "all"
            ? "Promote a creator from Leads (Sign to Roster button) to add them here."
            : "Switch the chip row back to All to see every signed creator."
        }
        toolbarExtras={
          canEdit ? (
            <AddCreatorDialog signed={true} onCreated={setPendingProfileId} />
          ) : null
        }
        hideColumns={["country", "tier", "status"]}
        showStar
        canEdit={canEdit}
        extraColumn={[
          {
            header: `YTD ${currentYear}`,
            render: (c) => {
              const ytd = earningsYTD?.get(c.id) ?? 0;
              return (
                <span
                  className={cn(
                    "tabular text-xs",
                    ytd > 0 ? "text-paid font-semibold" : "text-muted-foreground",
                  )}
                  title={ytd > 0 ? "Gross billed this year" : "No revenue logged this year"}
                >
                  {ytd > 0 ? formatUSD(ytd, { decimals: 0 }) : "—"}
                </span>
              );
            },
          },
          {
            header: "Contract",
            render: (c) => (
              <div className="flex items-center gap-2">
                {c.contract_terms ? (
                  <CheckCircle2
                    className="h-3 w-3 shrink-0 text-paid"
                    strokeWidth={2}
                    aria-label="Contract on file"
                  />
                ) : (
                  <FileSignature
                    className="h-3 w-3 shrink-0 text-partial"
                    strokeWidth={1.5}
                    aria-label="Contract missing"
                  />
                )}
                <span
                  className={
                    c.contract_terms
                      ? "truncate text-xs"
                      : "text-xs text-muted-foreground"
                  }
                  title={c.contract_terms ?? undefined}
                  style={{ maxWidth: 160 }}
                >
                  {c.contract_terms ? c.contract_terms : "—"}
                </span>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    aria-label="Edit contract terms"
                    onClick={() => setEditTarget(c)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ),
          },
        ]}
        rowAction={
          canEdit
            ? (c) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setProfileTarget(c)}
                    title="Open full profile (legal name, contact, commission %)"
                  >
                    <IdCard className="mr-1 h-3 w-3" /> Profile
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onUnsign(c)}
                    title="Move back to Leads"
                    disabled={setSigned.isPending}
                  >
                    <UserMinus className="mr-1 h-3 w-3" /> Unsign
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => onDelete(c)}
                    title="Permanently delete"
                    disabled={del.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )
            : undefined
        }
      />

      {profileTarget && (
        <CreatorProfileDialog
          creator={profileTarget as never}
          open={!!profileTarget}
          onOpenChange={(o) => !o && setProfileTarget(null)}
        />
      )}

      {editTarget && (
        <ContractTermsDialog
          creator={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      )}
    </div>
  );
}

function ContractTermsDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [terms, setTerms] = React.useState(creator.contract_terms ?? "");
  const save = useUpdateContractTerms();

  React.useEffect(() => {
    if (open) setTerms(creator.contract_terms ?? "");
  }, [open, creator.contract_terms]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync({ id: creator.id, contract_terms: terms.trim() || null });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contract terms — {creator.name}</DialogTitle>
          <DialogDescription>
            Link to the signed contract or summarise the key terms. Visible on
            the Roster row.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="terms">Terms / contract link</Label>
            <Input
              id="terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
          {save.error ? (
            <p className="text-sm text-destructive">{(save.error as Error).message}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
