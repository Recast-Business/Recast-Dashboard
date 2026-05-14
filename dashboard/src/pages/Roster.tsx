import * as React from "react";
import { IdCard, Pencil, Trash2, UserMinus } from "lucide-react";
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
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/auth/AuthProvider";
import { EyebrowLabel } from "@/components/recast";

export function RosterPage() {
  const { role } = useAuth();
  const canEdit = role === "admin";
  const { data, isLoading, error } = useCreators("signed");
  const [editTarget, setEditTarget] = React.useState<CreatorRow | null>(null);
  const [profileTarget, setProfileTarget] = React.useState<CreatorRow | null>(null);
  const setSigned = useSetCreatorSigned();
  const del = useBulkDeleteCreators();
  const confirm = useConfirm();

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
      {/* Top eyebrow strip — canonical page anchor. Roster is in the
          Pipeline section per Sweep 8's sidebar IA (operational lens
          on signed creators; Talent Ledger is the finance lens). */}
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        Pipeline · Roster
      </div>
      <div>
        <EyebrowLabel withRule>Signed creators</EyebrowLabel>
        <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
          Roster
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
          Creators signed to Recast. These appear in Campaigns and Briefs by
          default. Click any name to open the full creator profile.
        </p>
      </div>

      <CreatorTable
        rows={(data ?? []) as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle="No signed creators yet"
        emptyHint="Promote a creator from Leads (Sign to Roster button) to add them here."
        toolbarExtras={
          canEdit ? (
            <AddCreatorDialog signed={true} onCreated={setPendingProfileId} />
          ) : null
        }
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
