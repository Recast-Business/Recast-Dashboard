import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreators } from "@/hooks/useCreators";
import { cn } from "@/lib/utils";

function BarRow({
  label,
  value,
  max,
  color,
  total,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  total: number;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const shareOfTotal = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
        <div
          className={cn("h-full transition-[width]", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right tabular-nums">
        <strong>{value}</strong>
        <span className="ml-1 text-[10px] text-muted-foreground">({shareOfTotal}%)</span>
      </span>
    </div>
  );
}

function topN<T extends { value: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.value - a.value).slice(0, n);
}

export function RosterAnalytics() {
  const { data, isLoading } = useCreators("all");

  const stats = React.useMemo(() => {
    const all = data ?? [];
    const total = all.length;
    const signed = all.filter((c) => c.signed).length;
    const leads = total - signed;
    const starred = all.filter((c) => (c as any).starred).length;

    const twitchOnly = all.filter((c) => c.twitch_handle && !c.kick_handle).length;
    const kickOnly = all.filter((c) => !c.twitch_handle && c.kick_handle).length;
    const both = all.filter((c) => c.twitch_handle && c.kick_handle).length;

    const tierCounts: Record<string, number> = {};
    for (const c of all) {
      const t = c.tier || "Unknown";
      tierCounts[t] = (tierCounts[t] ?? 0) + 1;
    }

    const ctr: Record<string, number> = {};
    for (const c of all) {
      if (!c.country) continue;
      ctr[c.country] = (ctr[c.country] ?? 0) + 1;
    }

    const cat: Record<string, number> = {};
    for (const c of all) {
      if (!c.category) continue;
      cat[c.category] = (cat[c.category] ?? 0) + 1;
    }

    const statusCounts: Record<string, number> = {};
    for (const c of all) {
      const s = (c as any).outreach_status || "Not Contacted";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    return {
      total,
      signed,
      leads,
      starred,
      twitchOnly,
      kickOnly,
      both,
      tiers: Object.entries(tierCounts).map(([label, value]) => ({ label, value })),
      countries: topN(
        Object.entries(ctr).map(([label, value]) => ({ label, value })),
        8,
      ),
      categories: topN(
        Object.entries(cat).map(([label, value]) => ({ label, value })),
        8,
      ),
      statuses: topN(
        Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
        8,
      ),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const tierMax = Math.max(1, ...stats.tiers.map((t) => t.value));
  const countryMax = Math.max(1, ...stats.countries.map((t) => t.value));
  const catMax = Math.max(1, ...stats.categories.map((t) => t.value));
  const statusMax = Math.max(1, ...stats.statuses.map((t) => t.value));
  const platMax = Math.max(1, stats.twitchOnly, stats.kickOnly, stats.both);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Roster analytics</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total creators" value={stats.total} accent="text-primary" />
        <Kpi label="Signed" value={stats.signed} accent="text-green-600" />
        <Kpi label="Leads" value={stats.leads} accent="text-blue-600" />
        <Kpi label="Starred" value={stats.starred} accent="text-amber-500" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Platform split
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <BarRow
              label="Twitch only"
              value={stats.twitchOnly}
              max={platMax}
              color="bg-purple-500"
              total={stats.total}
            />
            <BarRow
              label="Kick only"
              value={stats.kickOnly}
              max={platMax}
              color="bg-green-500"
              total={stats.total}
            />
            <BarRow
              label="Twitch + Kick"
              value={stats.both}
              max={platMax}
              color="bg-blue-500"
              total={stats.total}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tiers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {stats.tiers.length === 0 ? (
              <div className="text-xs text-muted-foreground">No tier data.</div>
            ) : (
              stats.tiers.map((t) => (
                <BarRow
                  key={t.label}
                  label={t.label}
                  value={t.value}
                  max={tierMax}
                  color="bg-indigo-500"
                  total={stats.total}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Outreach funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {stats.statuses.length === 0 ? (
              <div className="text-xs text-muted-foreground">No outreach data.</div>
            ) : (
              stats.statuses.map((s) => (
                <BarRow
                  key={s.label}
                  label={s.label}
                  value={s.value}
                  max={statusMax}
                  color="bg-sky-500"
                  total={stats.total}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top countries
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {stats.countries.length === 0 ? (
              <div className="text-xs text-muted-foreground">No country data.</div>
            ) : (
              stats.countries.map((c) => (
                <BarRow
                  key={c.label}
                  label={c.label}
                  value={c.value}
                  max={countryMax}
                  color="bg-teal-500"
                  total={stats.total}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {stats.categories.length === 0 ? (
              <div className="text-xs text-muted-foreground">No category data.</div>
            ) : (
              stats.categories.map((c) => (
                <BarRow
                  key={c.label}
                  label={c.label}
                  value={c.value}
                  max={catMax}
                  color="bg-orange-500"
                  total={stats.total}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-semibold tabular-nums", accent)}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
