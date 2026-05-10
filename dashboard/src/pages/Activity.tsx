import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { EyebrowLabel } from "@/components/recast";

export function ActivityPage() {
  return (
    <div className="space-y-6">
      {/* Top eyebrow strip — canonical page anchor. */}
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        Workspace · Activity
      </div>
      <div>
        <EyebrowLabel withRule>Real-time feed</EyebrowLabel>
        <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
          Activity
        </h1>
        <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
          Real-time stream of new campaigns, payments, and flags. Updates
          push live as events fire.
        </p>
      </div>
      <ActivityFeed />
    </div>
  );
}
