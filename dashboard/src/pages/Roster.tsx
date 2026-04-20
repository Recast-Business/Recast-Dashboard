import * as React from "react";
import { Pencil } from "lucide-react";
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
import { useCreators, useUpdateContractTerms } from "@/hooks/useCreators";
import { useAuth } from "@/auth/AuthProvider";

export function RosterPage() {
  const { role } = useAuth();
  const canEdit = role === "admin";
  const { data, isLoading, error } = useCreators("signed");
  const [editTarget, setEditTarget] = React.useState<CreatorRow | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roster</h1>
        <p className="text-sm text-muted-foreground">
          Creators signed to Recast. These appear in Campaigns and Briefs by
          default.
        </p>
      </div>

      <CreatorTable
        rows={(data ?? []) as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle="No signed creators yet"
        emptyHint="Promote a creator from Leads (Sign to Roster button) to add them here."
        toolbarExtras={canEdit ? <AddCreatorDialog signed={true} /> : null}
        hideColumns={["country", "tier", "status"]}
        showStar
        canEdit={canEdit}
        extraColumn={{
          header: "Contract",
          render: (c) => (
            <div className="flex items-center gap-2">
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
        }}
      />

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
              placeholder="e.g. 2yr excl, 20% commission, link to signed PDF…"
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
