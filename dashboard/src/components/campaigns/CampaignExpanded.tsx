import * as React from "react";
import { Activity, Check, ChevronDown, ChevronsUpDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { cn } from "@/lib/utils";
import { useCampaignCreators } from "@/hooks/useCampaignCreators";
import { useCreators, useAddCreatorToCampaign } from "@/hooks/useCreators";
import { CampaignCreatorRow } from "./CampaignCreatorRow";
import type { UserRole } from "@/types/database";

interface Props {
  campaignId: string;
  commissionRate: number;
  role: UserRole;
}

export function CampaignExpanded({ campaignId, commissionRate, role }: Props) {
  const { data: rows, isLoading } = useCampaignCreators(campaignId);

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">Creators</div>
          {role !== "partner" && <AddCreator campaignId={campaignId} />}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows && rows.length > 0 ? (
          <div className="divide-y">
            <div className="grid grid-cols-[1fr,130px,130px,130px,40px] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <div>Creator</div>
              <div>Earnings</div>
              <div>Commission</div>
              <div>Payment</div>
              <div />
            </div>
            {rows.map((row) => (
              <CampaignCreatorRow
                key={row.id}
                row={row}
                commissionRate={commissionRate}
                role={role}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No creators on this campaign yet.
            {role !== "partner" && " Add one to start tracking earnings."}
          </div>
        )}
      </div>

      {role !== "partner" && <CampaignActivitySection campaignId={campaignId} />}
    </div>
  );
}

function CampaignActivitySection({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Campaign activity
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t p-4">
              <ActivityFeed
                campaignId={campaignId}
                limit={25}
                emptyMessage="No activity yet on this campaign."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddCreator({ campaignId }: { campaignId: string }) {
  const [includeLeads, setIncludeLeads] = React.useState(false);
  const { data: creators } = useCreators(includeLeads ? "all" : "signed");
  const add = useAddCreatorToCampaign();
  const [pick, setPick] = React.useState<string>("");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const picked = React.useMemo(
    () => creators?.find((c) => c.id === pick),
    [creators, pick],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = creators ?? [];
    if (!q) return list.slice(0, 50);
    return list
      .filter((c) => {
        const hay = [c.name, c.twitch_handle, c.kick_handle]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [creators, query]);

  return (
    <div className="flex items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-[220px] justify-between text-xs font-normal"
          >
            <span className={cn("truncate", !picked && "text-muted-foreground")}>
              {picked ? picked.name : "Select a creator…"}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0">
          <div className="space-y-2 border-b p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search creators…"
              className="h-8 text-xs"
            />
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={includeLeads}
                onChange={(e) => setIncludeLeads(e.target.checked)}
              />
              Include Leads (unsigned creators)
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No creators match.
              </div>
            ) : (
              filtered.map((c) => {
                const selected = c.id === pick;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted",
                      selected && "bg-muted",
                    )}
                    onClick={() => {
                      setPick(c.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1 truncate">
                        <span className="truncate font-medium">{c.name}</span>
                        {!c.signed && (
                          <span className="shrink-0 rounded-sm bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                            Lead
                          </span>
                        )}
                      </span>
                      {(c.twitch_handle || c.kick_handle) && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {c.twitch_handle
                            ? `twitch.tv/${c.twitch_handle}`
                            : `kick.com/${c.kick_handle}`}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        variant="outline"
        disabled={!pick || add.isPending}
        onClick={async () => {
          await add.mutateAsync({ campaign_id: campaignId, creator_id: pick });
          setPick("");
        }}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
