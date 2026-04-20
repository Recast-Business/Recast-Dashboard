import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUSD } from "@/lib/utils";
import { useFinanceSummary } from "@/hooks/useFinanceSummary";
import { OverdueBanner } from "./OverdueBanner";
import { RosterAnalytics } from "./RosterAnalytics";
import { CampaignList } from "@/components/campaigns/CampaignList";
import { useAuth } from "@/auth/AuthProvider";

export function FinanceHub() {
  const { role } = useAuth();
  const { data, isLoading, error } = useFinanceSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Earnings, commission, cash flow, and overdue flags across all live campaigns.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {isLoading || !data ? (
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <>
          <OverdueBanner count={data.overdueCount} campaigns={data.overdueCampaigns} />

          <div className="grid grid-cols-4 gap-4">
            <Stat
              label="Active earnings"
              value={formatUSD(data.totalActiveEarnings)}
            />
            <Stat
              label="Recast commission (live)"
              value={formatUSD(data.totalActiveCommission)}
            />
            <Stat
              label="Due this month"
              value={formatUSD(data.cashFlowThisMonth)}
              sub={data.awaitingPaymentCount > 0 ? `${data.awaitingPaymentCount} awaiting` : undefined}
            />
            <Stat label="Due next month" value={formatUSD(data.cashFlowNextMonth)} />
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Active campaigns</h2>
            {role && <CampaignList role={role} filterStatus="active" />}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Awaiting payment</h2>
            {role && <CampaignList role={role} filterStatus="awaiting_payment" />}
          </section>

          <RosterAnalytics />
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
