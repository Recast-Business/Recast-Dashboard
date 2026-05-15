import * as React from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreators } from "@/hooks/useCreators";
import { useVendors } from "@/hooks/useVendors";
import {
  useAddTalentToGrid,
  useTalentGridTracking,
  type TalentGridSide,
} from "@/hooks/useTalentGridTracking";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Vendor } from "@/types/finance";

/**
 * R5 follow-up — "Add Talent" picker for both Invoice grid sides.
 *
 * Both sides now source the Talent Ledger directly (Bruno: all talent
 * pickers should pull from the ledger, not a separate vendors list).
 *
 * Side-specific persistence:
 *   • paying_us → talent_grid_tracking row keyed by creator_id.
 *   • we_pay    → find-or-create a vendors row (kind='talent_we_pay',
 *                  creator_id=picked) per migration 0050, then track
 *                  by that vendor_id. The unique partial index makes
 *                  the find-or-create idempotent.
 *
 * Already-on-grid rows render at the top with an "Added" badge.
 */

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side: TalentGridSide;
  year: number;
}

interface PickerRow {
  id: string;
  name: string;
  subtitle?: string;
  alreadyAdded: boolean;
}

export function AddTalentToGridDialog({ open, onOpenChange, side, year }: Props) {
  const [search, setSearch] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const qc = useQueryClient();
  const add = useAddTalentToGrid();
  const { data: tracking } = useTalentGridTracking(side, year);
  const { data: creators } = useCreators("signed");
  // we_pay side: existing vendor rows let us mark creators that
  // already have an underlying vendor row (so the row is "added"
  // if the vendor_id appears in tracking). Drives the badge state.
  const { data: vendors } = useVendors({ kind: "talent_we_pay" });

  // Reset search when the dialog re-opens so stale filters don't
  // carry over across sessions.
  React.useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  // Map creator_id → underlying talent_we_pay vendor row (if any).
  const vendorByCreator = React.useMemo(() => {
    const m: Record<string, Vendor> = {};
    for (const v of vendors ?? []) {
      if (v.creator_id) m[v.creator_id] = v;
    }
    return m;
  }, [vendors]);

  const trackedTargetIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of tracking ?? []) {
      const id = side === "paying_us" ? t.creator_id : t.vendor_id;
      if (id) s.add(id);
    }
    return s;
  }, [tracking, side]);

  const rows: PickerRow[] = React.useMemo(() => {
    return (creators ?? []).map((c) => {
      const trackedId =
        side === "paying_us" ? c.id : vendorByCreator[c.id]?.id;
      return {
        id: c.id,
        name: c.name,
        subtitle: c.category ?? undefined,
        alreadyAdded: trackedId ? trackedTargetIds.has(trackedId) : false,
      };
    });
  }, [creators, side, vendorByCreator, trackedTargetIds]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.subtitle?.toLowerCase().includes(q) ?? false),
      );
    }
    // Already-added rows at the top so the user can confirm they're
    // available; pickable rows below.
    return [...list].sort((a, b) => {
      if (a.alreadyAdded !== b.alreadyAdded) return a.alreadyAdded ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [rows, search]);

  // For the we_pay side, look up the talent_we_pay vendor row for the
  // selected creator. Create it if it doesn't exist yet — the partial
  // unique index on vendors(creator_id) WHERE kind='talent_we_pay'
  // keeps this idempotent under concurrent picks.
  async function findOrCreateTalentVendor(
    creatorId: string,
    creatorName: string,
  ): Promise<string> {
    const existing = vendorByCreator[creatorId];
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from("vendors")
      .insert({
        name: creatorName,
        kind: "talent_we_pay",
        creator_id: creatorId,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    // Refresh useVendors so the grid + dialog both pick up the new row.
    await qc.invalidateQueries({ queryKey: ["vendors"] });
    return data.id as string;
  }

  async function onPick(row: PickerRow) {
    if (row.alreadyAdded) return;
    setPendingId(row.id);
    try {
      let trackedId = row.id;
      if (side === "we_pay") {
        trackedId = await findOrCreateTalentVendor(row.id, row.name);
      }
      await add.mutateAsync({
        side,
        year,
        ...(side === "paying_us"
          ? { creator_id: trackedId }
          : { vendor_id: trackedId }),
      });
      toast.success(`${row.name} added to ${year} grid`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Add failed: ${(e as Error).message}`);
    } finally {
      setPendingId(null);
    }
  }

  const title =
    side === "paying_us" ? "Add Talent · Paying Us" : "Add Talent · We Pay";
  const description =
    "Pick a signed creator from the Talent Ledger. They'll appear on the grid with empty monthly cells — click any \"+\" cell to record that month.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel"
              strokeWidth={1.5}
            />
            <Input
              placeholder="Search creators…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-[13px]"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-6 py-3">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/40 p-6 text-center text-[12.5px] text-steel">
              {rows.length === 0
                ? "No signed creators yet. Add one from the Talent Ledger first."
                : "No matches for that search."}
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {filtered.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onPick(row)}
                    disabled={row.alreadyAdded || add.isPending || pendingId !== null}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left transition-colors duration-base ease-out",
                      row.alreadyAdded
                        ? "cursor-default opacity-60"
                        : "hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-white">
                        {row.name}
                      </div>
                      {row.subtitle ? (
                        <div className="truncate text-[11px] text-steel">
                          {row.subtitle}
                        </div>
                      ) : null}
                    </div>
                    {row.alreadyAdded ? (
                      <span className="rounded-sm bg-paid-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paid">
                        Added
                      </span>
                    ) : (
                      <UserPlus
                        className="h-3.5 w-3.5 shrink-0 text-steel"
                        strokeWidth={1.5}
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-rule px-6 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={add.isPending}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
