import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteCampaign } from "@/hooks/useBrands";
import type { CampaignRow } from "@/hooks/useCampaigns";

interface Props {
  campaign: CampaignRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteCampaignDialog({ campaign, open, onOpenChange }: Props) {
  const del = useDeleteCampaign();

  async function onConfirm() {
    await del.mutateAsync(campaign.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete campaign</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{campaign.name}</strong> and all{" "}
            {campaign.creator_count} attached creator
            {campaign.creator_count === 1 ? "" : "s"}, including every logged
            deal structure and payment record. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {del.error ? (
          <p className="text-sm text-destructive">
            {(del.error as Error).message}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={del.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={del.isPending}
          >
            {del.isPending ? "Deleting…" : "Delete campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
