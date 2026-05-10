import { CreatorTable, type CreatorRow } from "@/components/roster/CreatorTable";
import { useCreators } from "@/hooks/useCreators";
import { useAuth } from "@/auth/AuthProvider";
import { EyebrowLabel } from "@/components/recast";

export function PotentialPage() {
  const { role } = useAuth();
  const canEdit = role !== "partner";
  const { data, isLoading, error } = useCreators("starred");

  return (
    <div className="space-y-6">
      {/* Top eyebrow strip — canonical page anchor. */}
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        Pipeline · Potential
      </div>
      <div>
        <EyebrowLabel withRule>Starred · highest priority</EyebrowLabel>
        <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
          Potential
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
          Starred creators across the Roster and Leads. Use this shortlist to
          narrow in on who to pitch next.
        </p>
      </div>

      <CreatorTable
        rows={(data ?? []) as CreatorRow[]}
        isLoading={isLoading}
        error={(error as Error) ?? null}
        emptyTitle="No starred creators yet"
        emptyHint="Click the star icon on any Lead or Roster row to add them here."
        showCCV
        showStar
        showPlatformFilter
        hideColumns={["category"]}
        canEdit={canEdit}
      />
    </div>
  );
}
