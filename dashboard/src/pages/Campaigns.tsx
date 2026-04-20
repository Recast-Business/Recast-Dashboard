import { useAuth } from "@/auth/AuthProvider";
import { AddCampaignDialog } from "@/components/campaigns/AddCampaignDialog";
import { CampaignList } from "@/components/campaigns/CampaignList";

export function CampaignsPage() {
  const { role } = useAuth();
  if (!role) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Brand-led campaigns. Click any row to expand creators and deals inline.
          </p>
        </div>
        {role !== "partner" && <AddCampaignDialog />}
      </div>
      <CampaignList role={role} />
    </div>
  );
}
