import * as React from "react";
import { CheckCircle2, Star, Tag, UserCheck, Users } from "lucide-react";
import { CreatorTable, type CreatorRow } from "@/components/roster/CreatorTable";
import { useCreators } from "@/hooks/useCreators";
import { useAuth } from "@/auth/AuthProvider";
import {
  PageHeader,
  MetricStrip,
  type MetricTile,
} from "@/components/recast";
import { cn } from "@/lib/utils";

/**
 * R5 follow-up — KPIs + signed/unsigned filter chips for the Potential
 * page. Starred is a star-flag overlay across the Lead + Roster pools,
 * so the page renders a mixed list. The chip row lets the user narrow
 * to the actionable subset (unsigned-starred = "pitch these next").
 */

export function PotentialPage() {
  const { role } = useAuth();
  const canEdit = role !== "partner";
  const { data, isLoading, error } = useCreators("starred");
  const [signedFilter, setSignedFilter] = React.useState<"all" | "signed" | "unsigned">("all");

  const rows = data ?? [];

  const signedCount = React.useMemo(
    () => rows.filter((c) => c.signed).length,
    [rows],
  );
  const unsignedCount = rows.length - signedCount;

  // Top category — the most common tag across starred rows.
  const topCategory = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of rows) {
      const cat = c.category ?? null;
      if (!cat) continue;
      m.set(cat, (m.get(cat) ?? 0) + 1);
    }
    let best: { label: string; count: number } | null = null;
    for (const [label, count] of m) {
      if (!best || count > best.count) best = { label, count };
    }
    return best;
  }, [rows]);

  const kpis: MetricTile[] = [
    {
      label: "Total starred",
      value: String(rows.length),
      sub: rows.length === 0 ? "—" : `${signedCount} signed · ${unsignedCount} unsigned`,
      icon: Star,
    },
    {
      label: "Signed share",
      value: rows.length === 0 ? "—" : `${Math.round((signedCount / rows.length) * 100)}%`,
      sub: rows.length === 0 ? "—" : `${signedCount} on Roster`,
      icon: CheckCircle2,
      tone: signedCount > 0 ? "paid" : "default",
    },
    {
      label: "Pitch next",
      value: String(unsignedCount),
      sub: unsignedCount === 0 ? "All converted" : "Unsigned · action ready",
      icon: UserCheck,
      tone: unsignedCount > 0 ? "partial" : "default",
    },
    {
      label: "Top category",
      value: topCategory ? topCategory.label : "—",
      sub: topCategory ? `${topCategory.count} starred` : "No category data",
      icon: Tag,
    },
  ];

  const chips = [
    { value: "all" as const, label: "All", count: rows.length },
    { value: "unsigned" as const, label: "Unsigned · pitch next", count: unsignedCount },
    { value: "signed" as const, label: "Signed", count: signedCount },
  ];

  const filteredRows = React.useMemo(() => {
    if (signedFilter === "all") return rows;
    if (signedFilter === "signed") return rows.filter((c) => c.signed);
    return rows.filter((c) => !c.signed);
  }, [rows, signedFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Pipeline · Potential"
        eyebrow="Starred · highest priority"
        title="Potential"
        description={
          <>
            Starred creators across the Roster and Leads. Use this shortlist
            to narrow in on who to pitch next.
          </>
        }
      />

      <MetricStrip tiles={kpis} />

      {/* R5 follow-up — signed/unsigned filter chip row. The starred
          pool mixes signed creators (already on Roster) with unsigned
          leads, and the typical Potential workflow is to focus on
          unsigned ones for the next pitch wave. Chip row defaults to
          "All" so the page still shows the full shortlist by default. */}
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((c) => {
          const active = signedFilter === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setSignedFilter(c.value)}
              className={cn(
                "h-8 rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-base ease-out",
                active
                  ? "border-electric/40 bg-electric/10 text-electric"
                  : "border-rule bg-card text-steel hover:bg-white/[0.04] hover:text-white",
              )}
            >
              {c.label}
              <span className="tabular ml-1.5 text-[10px] text-steel/80">
                {c.count}
              </span>
            </button>
          );
        })}
        {rows.length > 0 ? (
          <span className="ml-auto flex items-center gap-1 text-[12px] text-steel">
            <Users className="h-3 w-3" strokeWidth={1.5} />
            {filteredRows.length} shown
          </span>
        ) : null}
      </div>

      <CreatorTable
        stateKey="potential"
        rows={filteredRows as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle={
          signedFilter === "all"
            ? "No starred creators yet"
            : "No matches for this filter"
        }
        emptyHint={
          signedFilter === "all"
            ? "Click the star icon on any Lead or Roster row to add them here."
            : 'Switch to "All" to see every starred creator.'
        }
        showCCV
        showStar
        showPlatformFilter
        hideColumns={["category"]}
        canEdit={canEdit}
      />
    </div>
  );
}
