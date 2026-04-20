import * as React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, FilePlus2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignStatusBadge } from "./StatusBadge";
import { CampaignExpanded } from "./CampaignExpanded";
import { AddCampaignDialog } from "./AddCampaignDialog";
import { DeleteCampaignDialog } from "./DeleteCampaignDialog";
import { cn, formatUSD } from "@/lib/utils";
import { useCampaigns, type CampaignRow } from "@/hooks/useCampaigns";
import type { UserRole } from "@/types/database";

interface Props {
  role: UserRole;
  filterStatus?: "active" | "overdue" | "awaiting_payment";
}

export function CampaignList({ role, filterStatus }: Props) {
  const { data: campaigns, isLoading, error } = useCampaigns();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openId = params.get("open");
  const [editTarget, setEditTarget] = React.useState<CampaignRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CampaignRow | null>(null);
  const canManage = role === "admin" || role === "finance";

  const filtered = React.useMemo(() => {
    if (!campaigns) return [];
    if (!filterStatus) return campaigns;
    return campaigns.filter((c) => c.status === filterStatus);
  }, [campaigns, filterStatus]);

  function toggle(id: string) {
    const next = new URLSearchParams(params);
    if (next.get("open") === id) next.delete("open");
    else next.set("open", id);
    setParams(next, { replace: true });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load campaigns: {(error as Error).message}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        No campaigns yet. Create one to start tracking earnings.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {editTarget && (
        <AddCampaignDialog
          campaign={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteCampaignDialog
          campaign={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        />
      )}
      {filtered.map((c) => {
        const isOpen = openId === c.id;
        return (
          <div
            key={c.id}
            className={cn(
              "relative rounded-lg border bg-card shadow-sm transition-shadow",
              isOpen && "shadow-md",
            )}
          >
            {canManage && (
              <div className="absolute right-2 top-2 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      aria-label="Campaign actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditTarget(c)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDeleteTarget(c)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <button
              type="button"
              className="grid w-full grid-cols-[24px,1fr,120px,140px,140px,140px] items-center gap-4 px-4 py-4 pr-12 text-left"
              onClick={() => toggle(c.id)}
              aria-expanded={isOpen}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-90",
                )}
              />
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c.brand?.name ?? "Unknown brand"}
                  {c.type && <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">· {c.type}</span>}
                </div>
                <div className="font-semibold">{c.name}</div>
                {c.brief && (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/briefs?highlight=${c.brief!.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/briefs?highlight=${c.brief!.id}`);
                      }
                    }}
                    className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <FilePlus2 className="h-3 w-3" />
                    From brief: {c.brief.title}
                  </span>
                )}
              </div>
              <div>
                <CampaignStatusBadge status={c.status} />
              </div>
              <Stat label="Creators" value={c.creator_count.toString()} />
              <Stat label="Earnings" value={formatUSD(c.total_earnings)} />
              <Stat label="Commission" value={formatUSD(c.total_commission)} />
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <CampaignExpanded
                      campaignId={c.id}
                      commissionRate={c.commission_rate}
                      role={role}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
