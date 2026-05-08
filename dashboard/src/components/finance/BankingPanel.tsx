import * as React from "react";
import { Eye, EyeOff, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useBankingList,
  useDeleteBanking,
} from "@/hooks/useBanking";
import { useConfirm } from "@/hooks/useConfirm";
import { BankingDialog } from "@/components/finance/BankingDialog";
import { BankingRevealedView } from "@/components/finance/BankingRevealedView";

interface Props {
  vendorId?: string | null;
  creatorId?: string | null;
}

export function BankingPanel({ vendorId, creatorId }: Props) {
  const { data: items, isLoading } = useBankingList({ vendorId, creatorId });
  const del = useDeleteBanking();
  const confirm = useConfirm();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [revealedId, setRevealedId] = React.useState<string | null>(null);

  async function onDelete(id: string) {
    const ok = await confirm({
      title: "Delete banking record?",
      description: "This is logged in the audit trail and cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(id);
      toast.success("Banking record deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <Lock className="h-3 w-3" />
          Banking & cards
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          Loading…
        </div>
      )}

      {!isLoading && (!items || items.length === 0) && (
        <div className="rounded-md border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
          No banking details on file.
        </div>
      )}

      <div className="space-y-2">
        {items?.map((b: any) => (
          <div key={b.id} className="rounded-md border bg-background">
            <div className="flex items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.bank_name || "Bank account"}</span>
                  {b.card_last4 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                      {b.card_brand || "Card"} ••{b.card_last4}
                    </span>
                  )}
                </div>
                {b.account_profile && (
                  <div className="text-xs text-muted-foreground">{b.account_profile}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  setRevealedId(revealedId === b.id ? null : b.id)
                }
              >
                {revealedId === b.id ? (
                  <>
                    <EyeOff className="mr-1 h-3 w-3" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="mr-1 h-3 w-3" /> Reveal
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setEditingId(b.id)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => onDelete(b.id)}
                disabled={del.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {revealedId === b.id && (
              <div className="border-t bg-amber-50/50 p-2">
                <BankingRevealedView bankingId={b.id} />
              </div>
            )}
          </div>
        ))}
      </div>

      {(adding || editingId) && (
        <BankingDialog
          open={adding || !!editingId}
          onOpenChange={(o) => {
            if (!o) {
              setAdding(false);
              setEditingId(null);
            }
          }}
          editingId={editingId}
          vendorId={vendorId ?? null}
          creatorId={creatorId ?? null}
        />
      )}
    </div>
  );
}
