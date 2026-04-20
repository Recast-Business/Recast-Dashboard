import { CreatorTable, type CreatorRow } from "@/components/roster/CreatorTable";
import { useCreators } from "@/hooks/useCreators";
import { useAuth } from "@/auth/AuthProvider";

export function PotentialPage() {
  const { role } = useAuth();
  const canEdit = role !== "partner";
  const { data, isLoading, error } = useCreators("starred");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">★ Potential</h1>
        <p className="text-sm text-muted-foreground">
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
