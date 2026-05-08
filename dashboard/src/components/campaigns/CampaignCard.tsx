import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useCampaignCreators,
  type CampaignCreatorRow as CCRow,
} from "@/hooks/useCampaignCreators";
import {
  useCampaignPaymentsByCreators,
} from "@/hooks/useCampaignPayments";
import { useDeleteCampaign } from "@/hooks/useCampaigns";
import { useConfirm } from "@/hooks/useConfirm";
import { useViewCampaignFinancials } from "@/auth/useRole";
import { CampaignDialog } from "@/components/campaigns/CampaignDialog";
import { CampaignCreatorDialog } from "@/components/campaigns/CampaignCreatorDialog";
import { CampaignCreatorRow } from "@/components/campaigns/CampaignCreatorRow";
import type { CampaignStatusV2, CampaignV2 } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

const STATUS_STYLES: Record<CampaignStatusV2, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-900",
  awaiting_payment: "bg-amber-100 text-amber-900",
  overdue: "bg-rose-100 text-rose-900",
  completed: "bg-sky-100 text-sky-900",
};

interface Props {
  campaign: CampaignV2;
  year: number;
  canEdit: boolean;
}

export function CampaignCard({ campaign, year, canEdit }: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const [editingCampaign, setEditingCampaign] = React.useState(false);
  const [editingCreator, setEditingCreator] = React.useState<CCRow | null>(null);
  const [addingCreator, setAddingCreator] = React.useState(false);
  const del = useDeleteCampaign();
  const confirm = useConfirm();
  const seeFinancials = useViewCampaignFinancials();

  const { data: creators, isLoading } = useCampaignCreators(expanded ? campaign.id : null);
  const ccIds = React.useMemo(() => (creators ?? []).map((c) => c.id), [creators]);
  const { data: paymentsByCC } = useCampaignPaymentsByCreators(ccIds, year);

  const ytdGross = React.useMemo(() => {
    if (!paymentsByCC) return 0;
    let sum = 0;
    for (const ccId of Object.keys(paymentsByCC)) {
      for (const p of Object.values(paymentsByCC[ccId])) {
        sum += Number(p.amount) || 0;
      }
    }
    return sum;
  }, [paymentsByCC]);

  async function onDelete() {
    const ok = await confirm({
      title: `Delete "${campaign.name}"?`,
      description:
        "Removes the campaign, all attached creator deals, and all monthly payment history. Cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(campaign.id);
      toast.success("Campaign deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{campaign.brand}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate">{campaign.name}</span>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider", STATUS_STYLES[campaign.status])}>
              {campaign.status}
            </span>
            {campaign.campaign_type && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                {campaign.campaign_type}
              </span>
            )}
            {campaign.is_ad_overlay && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-900">
                Ad overlay
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {campaign.start_date ?? "—"} → {campaign.end_date ?? "—"}
            {seeFinancials && (
              <> · default {campaign.default_commission_pct}% to Recast</>
            )}
          </div>
        </div>
        {seeFinancials && (
          <div className="hidden items-center gap-3 text-xs sm:flex">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross YTD</span>
              <span className="text-base font-semibold tabular-nums">
                {formatUSD(ytdGross, { decimals: 0 })}
              </span>
            </div>
          </div>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          {campaign.description && (
            <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
              {campaign.description}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Creators on this campaign
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setAddingCreator(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add creator
              </Button>
            )}
          </div>

          {isLoading && (
            <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
              Loading creators…
            </div>
          )}
          {!isLoading && (!creators || creators.length === 0) && (
            <div className="rounded-md border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
              No creators attached yet — click <strong>Add creator</strong> to attach one with a deal.
            </div>
          )}

          <div className="space-y-2">
            {(creators ?? []).map((cc) => (
              <CampaignCreatorRow
                key={cc.id}
                campaignCreator={cc}
                defaultCommissionPct={campaign.default_commission_pct}
                year={year}
                payments={paymentsByCC?.[cc.id] ?? {}}
                onEdit={() => setEditingCreator(cc)}
              />
            ))}
          </div>

          {canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditingCampaign(true)}>
                <Pencil className="mr-1 h-3 w-3" /> Edit campaign
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
                disabled={del.isPending}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
            </div>
          )}

          {editingCampaign && (
            <CampaignDialog
              open
              onOpenChange={(o) => !o && setEditingCampaign(false)}
              campaign={campaign}
            />
          )}
          {addingCreator && (
            <CampaignCreatorDialog
              open
              onOpenChange={(o) => !o && setAddingCreator(false)}
              campaignId={campaign.id}
              defaultCommissionPct={campaign.default_commission_pct}
              campaignCreator={null}
            />
          )}
          {editingCreator && (
            <CampaignCreatorDialog
              open
              onOpenChange={(o) => !o && setEditingCreator(null)}
              campaignId={campaign.id}
              defaultCommissionPct={campaign.default_commission_pct}
              campaignCreator={editingCreator}
            />
          )}
        </div>
      )}
    </div>
  );
}
