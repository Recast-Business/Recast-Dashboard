import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { EyebrowLabel } from "@/components/recast";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatUSD } from "@/lib/utils";
import {
  useBriefs,
  useCreateBrief,
  useDeleteBrief,
  useMoveBrief,
  useUpdateBrief,
  type BriefInput,
  type BriefRow,
} from "@/hooks/useBriefs";
import type { BriefStage } from "@/types/database";
import { useAuth } from "@/auth/AuthProvider";

const STAGES: { id: BriefStage; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "outreach", label: "Outreach" },
  { id: "negotiating", label: "Negotiating" },
  { id: "exclusive", label: "Exclusive" },
  { id: "lost", label: "Lost" },
];

export function BriefBoard() {
  const { role } = useAuth();
  const canEdit = role !== "partner";
  const { data, isLoading } = useBriefs();
  const [params] = useSearchParams();
  const highlight = params.get("highlight");
  const [editTarget, setEditTarget] = React.useState<BriefRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<BriefRow | null>(null);

  React.useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`brief-${highlight}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <EyebrowLabel withRule>Pipeline · Brief Builder</EyebrowLabel>
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            Brief Builder
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
            Move a card to Exclusive to auto-create a campaign record.
          </p>
        </div>
        {canEdit && <BriefDialog />}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-5 gap-3">
          {STAGES.map((s) => (
            <div key={s.id} className="space-y-2">
              <Skeleton className="h-6" />
              <Skeleton className="h-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {STAGES.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage.id}
              label={stage.label}
              briefs={(data ?? []).filter((b) => b.stage === stage.id)}
              highlight={highlight}
              canEdit={canEdit}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {editTarget && (
        <BriefDialog
          brief={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteBriefDialog
          brief={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function StageColumn({
  stage,
  label,
  briefs,
  highlight,
  canEdit,
  onEdit,
  onDelete,
}: {
  stage: BriefStage;
  label: string;
  briefs: BriefRow[];
  highlight: string | null;
  canEdit: boolean;
  onEdit: (b: BriefRow) => void;
  onDelete: (b: BriefRow) => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span>{briefs.length}</span>
      </div>
      <div className="space-y-2">
        {briefs.map((b) => (
          <BriefCard
            key={b.id}
            brief={b}
            currentStage={stage}
            highlighted={b.id === highlight}
            canEdit={canEdit}
            onEdit={() => onEdit(b)}
            onDelete={() => onDelete(b)}
          />
        ))}
        {briefs.length === 0 && (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Empty
          </div>
        )}
      </div>
    </div>
  );
}

function BriefCard({
  brief,
  currentStage,
  highlighted,
  canEdit,
  onEdit,
  onDelete,
}: {
  brief: BriefRow;
  currentStage: BriefStage;
  highlighted: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const move = useMoveBrief();

  return (
    <div
      id={`brief-${brief.id}`}
      className={cn(
        "relative rounded-md border bg-card p-3 shadow-sm transition-shadow",
        highlighted && "ring-2 ring-primary ring-offset-2",
      )}
    >
      {canEdit && (
        <div className="absolute right-1 top-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                aria-label="Brief actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="pr-6 text-sm font-semibold">{brief.title}</div>
      {brief.brand && (
        <div className="text-xs text-muted-foreground">{brief.brand}</div>
      )}
      {brief.budget != null && (
        <div className="mt-1 text-xs tabular-nums">
          {formatUSD(Number(brief.budget))}
        </div>
      )}
      {brief.content_type && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {brief.content_type}
        </div>
      )}
      {brief.platforms && brief.platforms.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {brief.platforms.map((p) => (
            <span
              key={p}
              className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      )}
      {brief.geo && brief.geo.length > 0 && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {brief.geo.join(" · ")}
        </div>
      )}
      {brief.linked_campaign_id && (
        <Link
          to={`/campaigns?open=${brief.linked_campaign_id}`}
          className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View campaign <ArrowRight className="h-3 w-3" />
        </Link>
      )}
      <div className="mt-3">
        {canEdit ? (
          <Select
            value={currentStage}
            onValueChange={(v) => move.mutate({ id: brief.id, stage: v as BriefStage })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
            {STAGES.find((s) => s.id === currentStage)?.label}
          </div>
        )}
      </div>
    </div>
  );
}

interface DialogProps {
  brief?: BriefRow;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function BriefDialog({ brief, open: controlledOpen, onOpenChange }: DialogProps = {}) {
  const isEdit = !!brief;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [title, setTitle] = React.useState(brief?.title ?? "");
  const [brandName, setBrandName] = React.useState(brief?.brand ?? "");
  const [budget, setBudget] = React.useState(brief?.budget != null ? String(brief.budget) : "");
  const [contentType, setContentType] = React.useState(brief?.content_type ?? "");
  const [platforms, setPlatforms] = React.useState((brief?.platforms ?? []).join(", "));
  const [geo, setGeo] = React.useState((brief?.geo ?? []).join(", "));
  const [notes, setNotes] = React.useState(brief?.notes ?? "");

  React.useEffect(() => {
    if (!open) return;
    setTitle(brief?.title ?? "");
    setBrandName(brief?.brand ?? "");
    setBudget(brief?.budget != null ? String(brief.budget) : "");
    setContentType(brief?.content_type ?? "");
    setPlatforms((brief?.platforms ?? []).join(", "));
    setGeo((brief?.geo ?? []).join(", "));
    setNotes(brief?.notes ?? "");
  }, [open, brief]);

  const create = useCreateBrief();
  const update = useUpdateBrief();
  const mutation = isEdit ? update : create;

  function splitTags(v: string): string[] | null {
    const tags = v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: BriefInput = {
      title: title.trim(),
      brand: brandName.trim() || null,
      budget: budget ? Number(budget) : null,
      content_type: contentType.trim() || null,
      platforms: splitTags(platforms),
      geo: splitTags(geo),
      notes: notes.trim() || null,
    };
    if (isEdit && brief) {
      await update.mutateAsync({ id: brief.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New brief
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit brief" : "New brief"}</DialogTitle>
          <DialogDescription>
            Moving a brief to <strong>Exclusive</strong> automatically creates a
            campaign.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="b-title">Title</Label>
            <Input
              id="b-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="b-brand">Brand</Label>
              <Input
                id="b-brand"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-budget">Expected deal value ($)</Label>
              <Input
                id="b-budget"
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-content-type">Content type</Label>
            <Input
              id="b-content-type"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="b-platforms">Platforms</Label>
              <Input
                id="b-platforms"
                value={platforms}
                onChange={(e) => setPlatforms(e.target.value)}
                placeholder="Twitch, Kick (comma-separated)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-geo">Geo</Label>
              <Input
                id="b-geo"
                value={geo}
                onChange={(e) => setGeo(e.target.value)}
                placeholder="US, UK, EU (comma-separated)"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-notes">Notes</Label>
            <Input
              id="b-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Background, deliverables, constraints…"
            />
          </div>
          {mutation.error ? (
            <p className="text-sm text-destructive">
              {(mutation.error as Error).message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBriefDialog({
  brief,
  open,
  onOpenChange,
}: {
  brief: BriefRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const del = useDeleteBrief();

  async function onConfirm() {
    await del.mutateAsync(brief.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete brief</DialogTitle>
          <DialogDescription>
            Permanently removes <strong>{brief.title}</strong>. If this brief
            was promoted to a campaign, the campaign will lose its brief link
            but stays intact. This cannot be undone.
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
            {del.isPending ? "Deleting…" : "Delete brief"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
