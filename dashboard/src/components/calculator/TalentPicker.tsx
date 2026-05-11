import * as React from "react";
import { Check, ChevronsUpDown, IdCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreators } from "@/hooks/useCreators";
import { cn } from "@/lib/utils";

/**
 * R3E.2 — page-level talent picker for the Calculator.
 *
 * Drives a single optional filter applied to every sub-tab (OnlyFans,
 * Telegram, Overlay, Deals). When set, each section shows only the
 * deals tied to that creator and the surrounding KPI / pie analytics
 * recompute. When cleared, all sections show the full division
 * roll-up like before.
 *
 * Implementation notes:
 *   • Reuses useCreators("signed") so the picker list matches the
 *     Talent Ledger universe — no Scout/Lead noise.
 *   • Type-to-search Popover + Input combo (cheaper than the shadcn
 *     Command component since we only need single-select fuzzy on
 *     <500 rows).
 *   • Selecting a name closes the popover and lifts the id+name up.
 *     Clearing emits null.
 *   • Optional "kind" hint badge derived from socials/category so the
 *     dropdown visually disambiguates Twitch-vs-OF rosters at a
 *     glance.
 */

interface PickerCreator {
  id: string;
  name: string;
  category: string | null;
  country: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, creator?: PickerCreator) => void;
}

export function TalentPicker({ value, onChange }: Props) {
  const { data: creators, isLoading } = useCreators("signed");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const list: PickerCreator[] = React.useMemo(() => {
    return (creators ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      country: c.country,
    }));
  }, [creators]);

  const selected = React.useMemo(
    () => list.find((c) => c.id === value) ?? null,
    [list, value],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q),
    );
  }, [list, query]);

  function pick(c: PickerCreator) {
    onChange(c.id, c);
    setOpen(false);
    setQuery("");
  }

  function clear(e: React.MouseEvent) {
    // Click bubbles to the trigger button otherwise — stop it so the
    // popover doesn't reopen on clear.
    e.stopPropagation();
    onChange(null);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-[260px] justify-between font-normal",
            !selected && "text-steel",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <IdCard className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            {selected ? (
              <span className="truncate text-white">
                {selected.name}
                {selected.category ? (
                  <span className="ml-1.5 text-[11px] text-steel">
                    · {selected.category}
                  </span>
                ) : null}
              </span>
            ) : (
              <span>{isLoading ? "Loading talents…" : "Pick a talent (optional)"}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {selected ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear talent filter"
                onClick={clear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") clear(e as unknown as React.MouseEvent);
                }}
                className="rounded-sm p-0.5 text-steel hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            ) : null}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" strokeWidth={1.5} />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-0"
        onOpenAutoFocus={(e) => {
          // Focus the search input instead of the first list item so
          // typing the name shortcuts to a match instantly. The
          // Radix onOpenAutoFocus target is the content root; cast
          // explicitly because the synthetic event types this as
          // EventTarget.
          e.preventDefault();
          const root = e.currentTarget as HTMLElement | null;
          root?.querySelector<HTMLInputElement>("input")?.focus();
        }}
      >
        <div className="border-b p-2">
          <Input
            placeholder="Search talent…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-[13px]"
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-steel">
              {isLoading ? "Loading…" : "No matches"}
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.04]",
                  c.id === value && "bg-white/[0.06]",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-white">{c.name}</span>
                  {c.category || c.country ? (
                    <span className="block truncate text-[11px] text-steel">
                      {[c.category, c.country].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                {c.id === value ? (
                  <Check className="h-3.5 w-3.5 text-electric" strokeWidth={2} />
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
