import * as React from "react";
import { ChevronDown, Pencil, Receipt } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DealStructureBuilder } from "@/components/deal-builder/DealStructureBuilder";
import { PaymentStatusBadge } from "./StatusBadge";
import { PaymentHistory } from "./PaymentHistory";
import { PaymentLogDialog } from "./PaymentLogDialog";
import { cn, formatUSD } from "@/lib/utils";
import { hasManualOverrides } from "@/lib/earnings/calculate";
import {
  useSaveDealStructure,
  useUpdatePaymentStatus,
  type CampaignCreatorRow as Row,
} from "@/hooks/useCampaignCreators";
import type { DealComponent, ManualInputs } from "@/types/deal";
import type { PaymentStatus, UserRole } from "@/types/database";

function parseNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  row: Row;
  commissionRate: number;
  role: UserRole;
}

export function CampaignCreatorRow({ row, commissionRate, role }: Props) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DealComponent[]>(row.deal_structure);
  const [manualDraft, setManualDraft] = React.useState<ManualInputs>(row.manual_inputs);
  const [logPaymentOpen, setLogPaymentOpen] = React.useState(false);

  const save = useSaveDealStructure();
  const updatePay = useUpdatePaymentStatus();
  const canEditDeal = role === "admin" || role === "finance";
  const overrideActive = hasManualOverrides(row.manual_inputs);

  React.useEffect(() => setDraft(row.deal_structure), [row.deal_structure]);
  React.useEffect(() => setManualDraft(row.manual_inputs), [row.manual_inputs]);

  const dealDirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(row.deal_structure),
    [draft, row.deal_structure],
  );
  const manualDirty = React.useMemo(
    () => JSON.stringify(manualDraft) !== JSON.stringify(row.manual_inputs),
    [manualDraft, row.manual_inputs],
  );
  const dirty = dealDirty || manualDirty;
  const draftHasOverrides = hasManualOverrides(manualDraft);
  const noteMissing = draftHasOverrides && !manualDraft.note?.toString().trim();

  return (
    <div className="border-t">
      <div
        className={cn(
          "grid grid-cols-[1fr,130px,130px,130px,40px] items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted/40",
          open && "bg-muted/40",
        )}
      >
        <div>
          <div className="font-medium">{row.creator?.name ?? "Unknown creator"}</div>
          <div className="text-xs text-muted-foreground">
            {[
              row.creator?.twitch_handle
                ? `twitch.tv/${row.creator.twitch_handle}`
                : row.creator?.kick_handle
                  ? `kick.com/${row.creator.kick_handle}`
                  : null,
              row.creator?.tier,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="tabular-nums">
          <span className="inline-flex items-center gap-1">
            {formatUSD(row.cached_earnings)}
            {overrideActive && (
              <span
                title="Manual adjustment active"
                className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
              />
            )}
          </span>
        </div>
        <div className="tabular-nums">{formatUSD(row.cached_commission)}</div>
        <div>
          {role === "partner" ? (
            <PaymentStatusBadge status={row.payment_status} />
          ) : (
            <Select
              value={row.payment_status}
              onValueChange={(v) =>
                updatePay.mutate({
                  id: row.id,
                  campaign_id: row.campaign_id,
                  payment_status: v as PaymentStatus,
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="awaiting">Awaiting</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 bg-background px-4 py-4">
              {canEditDeal ? (
                <>
                  <DealStructureBuilder
                    value={draft}
                    onChange={setDraft}
                    commissionRate={commissionRate}
                  />

                  <ManualAdjustment
                    value={manualDraft}
                    onChange={setManualDraft}
                    noteMissing={noteMissing}
                  />

                  <div className="flex items-center justify-end gap-2">
                    {dirty && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDraft(row.deal_structure);
                          setManualDraft(row.manual_inputs);
                        }}
                      >
                        Discard
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={!dirty || noteMissing || save.isPending}
                      onClick={() =>
                        save.mutate({
                          id: row.id,
                          campaign_id: row.campaign_id,
                          deal_structure: draft,
                          commission_rate: commissionRate,
                          manual_inputs: manualDraft,
                        })
                      }
                    >
                      {save.isPending ? "Saving…" : "Save deal"}
                    </Button>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Payment history</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setLogPaymentOpen(true)}
                      >
                        <Receipt className="mr-2 h-3.5 w-3.5" /> Log payment
                      </Button>
                    </div>
                    <PaymentHistory
                      campaignCreatorId={row.id}
                      campaignId={row.campaign_id}
                      role={role}
                    />
                  </div>

                  <PaymentLogDialog
                    campaignCreatorId={row.id}
                    campaignId={row.campaign_id}
                    creatorName={row.creator?.name ?? "Unknown creator"}
                    cachedEarnings={row.cached_earnings}
                    open={logPaymentOpen}
                    onOpenChange={setLogPaymentOpen}
                  />
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 rounded-md border bg-muted/40 p-4 text-sm">
                    <Metric label="Gross earnings" value={row.cached_earnings} />
                    <Metric
                      label={`Recast commission (${commissionRate}%)`}
                      value={row.cached_commission}
                    />
                    <Metric
                      label="Creator net"
                      value={row.cached_earnings - row.cached_commission}
                    />
                  </div>
                  <div className="space-y-2 border-t pt-4">
                    <div className="text-sm font-semibold">Payment history</div>
                    <PaymentHistory
                      campaignCreatorId={row.id}
                      campaignId={row.campaign_id}
                      role={role}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{formatUSD(value)}</div>
    </div>
  );
}

interface ManualAdjustmentProps {
  value: ManualInputs;
  onChange: (next: ManualInputs) => void;
  noteMissing: boolean;
}

function ManualAdjustment({ value, onChange, noteMissing }: ManualAdjustmentProps) {
  const [expanded, setExpanded] = React.useState(hasManualOverrides(value));

  React.useEffect(() => {
    if (hasManualOverrides(value)) setExpanded(true);
  }, [value]);

  function patch(next: Partial<ManualInputs>) {
    onChange({ ...value, ...next });
  }

  const grossStr =
    value.override_gross != null && Number.isFinite(value.override_gross)
      ? String(value.override_gross)
      : "";
  const commStr =
    value.override_commission != null && Number.isFinite(value.override_commission)
      ? String(value.override_commission)
      : "";

  if (!expanded) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span>
          Manual adjustment — override gross or commission for one-off cases.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => setExpanded(true)}
        >
          <Pencil className="mr-1 h-3 w-3" /> Add adjustment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
          Manual adjustment
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            onChange({});
            setExpanded(false);
          }}
        >
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="override_gross" className="text-xs">
            Override gross ($)
          </Label>
          <Input
            id="override_gross"
            type="number"
            min={0}
            step="0.01"
            value={grossStr}
            onChange={(e) => patch({ override_gross: parseNumber(e.target.value) })}
            placeholder="Leave blank for auto"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="override_commission" className="text-xs">
            Override commission ($)
          </Label>
          <Input
            id="override_commission"
            type="number"
            min={0}
            step="0.01"
            value={commStr}
            onChange={(e) =>
              patch({ override_commission: parseNumber(e.target.value) })
            }
            placeholder="Leave blank for auto"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="override_note" className="text-xs">
          Note {hasManualOverrides(value) && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="override_note"
          value={value.note ?? ""}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="Why was this override applied?"
          className={cn("h-8 text-sm", noteMissing && "border-destructive")}
        />
        {noteMissing && (
          <p className="text-[11px] text-destructive">
            A note is required when overriding gross or commission.
          </p>
        )}
      </div>
    </div>
  );
}
