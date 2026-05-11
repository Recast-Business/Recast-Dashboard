import {
  AlertTriangle,
  Briefcase,
  CircleDollarSign,
  FilePlus2,
  Percent,
  Receipt,
  UserPlus,
  Wallet,
} from "lucide-react";
import { formatDistanceToNow } from "./formatDistanceToNow";
import { useActivityFeed, type ActivityItem } from "@/hooks/useActivityFeed";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityKind } from "@/types/database";

const ICONS: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  campaign_created: Briefcase,
  creator_added: UserPlus,
  earnings_updated: CircleDollarSign,
  payment_status_changed: Wallet,
  payment_logged: Receipt,
  overdue_flagged: AlertTriangle,
  brief_promoted: FilePlus2,
  commission_mode_changed: Percent,
};

function describe(item: ActivityItem): string {
  const p = item.payload ?? {};
  switch (item.kind) {
    case "campaign_created":
      return `New campaign: ${p["name"] ?? "(unnamed)"}`;
    case "creator_added":
      return "Creator added to campaign";
    case "earnings_updated":
      return `Earnings updated: $${p["from"] ?? 0} → $${p["to"] ?? 0}`;
    case "payment_status_changed":
      return `Payment: ${p["from"] ?? "—"} → ${p["to"] ?? "—"}`;
    case "payment_logged": {
      const amt = Number(p["amount"] ?? 0);
      return `Payment logged: $${amt.toFixed(2)}`;
    }
    case "overdue_flagged":
      return `Overdue: ${p["name"] ?? "campaign"}`;
    case "brief_promoted":
      return `Brief promoted to campaign: ${p["title"] ?? ""}`;
    case "commission_mode_changed": {
      const name = p["creator_name"] ?? "creator";
      const from = p["from"] ?? "—";
      const to = p["to"] ?? "—";
      return `Commission mode for ${name}: ${from} → ${to}`;
    }
  }
}

interface Props {
  campaignId?: string | null;
  limit?: number;
  emptyMessage?: string;
}

export function ActivityFeed({ campaignId = null, limit = 50, emptyMessage }: Props = {}) {
  const { data, isLoading, error } = useActivityFeed({ campaignId, limit });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">{(error as Error).message}</div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyMessage ?? "No activity yet."}
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-md border bg-card">
      {data.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 text-sm">{describe(item)}</div>
            <time
              className="text-xs text-muted-foreground"
              dateTime={item.created_at}
            >
              {formatDistanceToNow(item.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
