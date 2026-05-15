import * as React from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";

/**
 * R5 follow-up — "Add Talent" picker for both Invoice grid sides.
 *
 * Lists existing talent the user can add to the grid. Picking a row
 * inserts a talent_grid_tracking row for (side, year, target_id) and
 * closes the dialog. The grid then renders the new row with empty
 * "+" cells in every month.
 *
 * Side-specific source:
 *   • paying_us → useCreators("signed") — the Talent Ledger
 *   • we_pay    → useVendors({ kind: "talent_we_pay" })
 *
 * Already-on-grid rows render at the top of the list with a "Added"
 * badge and a disabled state so the user can see they're available
 * without re-clicking.
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
  const add = useAddTalentToGrid();
  const { data: tracking } = useTalentGridTracking(side, year);
  const { data: creators } = useCreators("signed");
  const { data: vendors } = useVendors({ kind: "talent_we_pay" });

  // Reset search when the dialog re-opens so stale filters don't
  // carry over across sessions.
  React.useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const trackedIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of tracking ?? []) {
      const id = side === "paying_us" ? t.creator_id : t.vendor_id;
      if (id) s.add(id);
    }
    return s;
  }, [tracking, side]);

  const rows: PickerRow[] = React.useMemo(() => {
    if (side === "paying_us") {
      return (creators ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.category ?? undefined,
        alreadyAdded: trackedIds.has(c.id),
      }));
    }
    return (vendors ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      subtitle: v.contact_name ?? undefined,
      alreadyAdded: trackedIds.has(v.id),
    }));
  }, [side, creators, vendors, trackedIds]);

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

  async function onPick(row: PickerRow) {
    if (row.alreadyAdded) return;
    try {
      await add.mutateAsync({
        side,
        year,
        ...(side === "paying_us"
          ? { creator_id: row.id }
          : { vendor_id: row.id }),
      });
      toast.success(`${row.name} added to ${year} grid`);
      onOpenChange(false);
    } catch {
      // useAddTalentToGrid already toasts on error.
    }
  }

  const title =
    side === "paying_us" ? "Add Talent · Paying Us" : "Add Talent · We Pay";
  const description =
    side === "paying_us"
      ? "Pick a signed creator from the Roster. They'll appear on the grid with empty monthly cells — click any \"+\" cell to record that month's invoice."
      : 'Pick a "Talent We Pay" vendor. They\'ll appear on the grid with empty monthly cells — click any "+" cell to record that month\'s payment.';

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
              placeholder={
                side === "paying_us"
                  ? "Search creators…"
                  : "Search vendors…"
              }
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
                ? side === "paying_us"
                  ? "No signed creators yet. Add one from the Roster page first."
                  : 'No "Talent We Pay" vendors yet. Add one from the Vendors page first.'
                : "No matches for that search."}
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {filtered.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onPick(row)}
                    disabled={row.alreadyAdded || add.isPending}
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
