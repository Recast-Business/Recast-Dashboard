import { Badge } from "@/components/ui/badge";
import type { CampaignStatus, PaymentStatus } from "@/types/database";

const CAMPAIGN_VARIANT: Record<
  CampaignStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "outline" }
> = {
  active: { label: "Active", variant: "success" },
  pending: { label: "Pending", variant: "secondary" },
  awaiting_payment: { label: "Awaiting payment", variant: "warning" },
  overdue: { label: "Overdue", variant: "destructive" },
  completed: { label: "Completed", variant: "outline" },
};

const PAYMENT_VARIANT: Record<
  PaymentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "outline" }
> = {
  unpaid: { label: "Unpaid", variant: "secondary" },
  awaiting: { label: "Awaiting", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  overdue: { label: "Overdue", variant: "destructive" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const { label, variant } = CAMPAIGN_VARIANT[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, variant } = PAYMENT_VARIANT[status];
  return <Badge variant={variant}>{label}</Badge>;
}
