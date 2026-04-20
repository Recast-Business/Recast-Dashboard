import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayments, useDeletePayment } from "@/hooks/usePayments";
import { formatUSD } from "@/lib/utils";
import type { UserRole } from "@/types/database";

interface Props {
  campaignCreatorId: string;
  campaignId: string;
  role: UserRole;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PaymentHistory({ campaignCreatorId, campaignId, role }: Props) {
  const { data, isLoading } = usePayments(campaignCreatorId);
  const del = useDeletePayment();
  const canDelete = role === "admin" || role === "finance";

  if (isLoading) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
        No payments logged yet.
      </div>
    );
  }

  const total = data.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[110px,120px,1fr,100px,40px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <div>Paid</div>
        <div>Amount</div>
        <div>Notes / period</div>
        <div className="text-right">Total</div>
        <div />
      </div>
      {data.map((p) => (
        <div
          key={p.id}
          className="grid grid-cols-[110px,120px,1fr,100px,40px] items-center gap-3 border-t px-3 py-2 text-xs"
        >
          <div>{formatDate(p.paid_at)}</div>
          <div className="tabular-nums font-medium">{formatUSD(p.amount)}</div>
          <div className="truncate text-muted-foreground">
            {p.notes ??
              (p.period_start || p.period_end
                ? `${formatDate(p.period_start)} – ${formatDate(p.period_end)}`
                : "—")}
          </div>
          <div />
          <div>
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                aria-label="Delete payment"
                onClick={() =>
                  del.mutate({
                    id: p.id,
                    campaign_creator_id: campaignCreatorId,
                    campaign_id: campaignId,
                  })
                }
                disabled={del.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[110px,120px,1fr,100px,40px] gap-3 border-t bg-muted/20 px-3 py-2 text-xs font-medium">
        <div className="col-span-3 text-muted-foreground">
          {data.length} payment{data.length === 1 ? "" : "s"}
        </div>
        <div className="tabular-nums text-right">{formatUSD(total)}</div>
        <div />
      </div>
    </div>
  );
}
