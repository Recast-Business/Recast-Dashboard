import { ActivityFeed } from "@/components/activity/ActivityFeed";

export function ActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Real-time stream of new campaigns, payments, and flags.
        </p>
      </div>
      <ActivityFeed />
    </div>
  );
}
