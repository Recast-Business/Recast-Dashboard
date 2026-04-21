import * as React from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/apiFetch";
import { useAuth } from "@/auth/AuthProvider";
import type { CreatorRow } from "@/components/roster/CreatorTable";

const STATUS_OPTIONS = [
  "Qualified — Primary Target",
  "Qualified — Shortlist",
  "Pending Review",
  "Does Not Fit — Wrong Content",
  "Does Not Fit — Active Deal",
  "Does Not Fit — CCV Too Low",
  "Does Not Fit — Wrong Geography",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creators: CreatorRow[];
}

export function GenerateBriefDialog({ open, onOpenChange, creators }: Props) {
  const { user } = useAuth();
  const email = user?.email ?? "";

  const [partner, setPartner] = React.useState("");
  const [campaign, setCampaign] = React.useState("");
  const [criteria, setCriteria] = React.useState("");
  const [monthYear, setMonthYear] = React.useState("");
  const [statuses, setStatuses] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPartner("");
    setCampaign("");
    setCriteria("");
    const d = new Date();
    setMonthYear(
      d.toLocaleString(undefined, { month: "long", year: "numeric" }),
    );
    setStatuses(
      Object.fromEntries(creators.map((c) => [c.id, "Pending Review"])),
    );
  }, [open, creators]);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!partner.trim() || !campaign.trim() || !criteria.trim()) {
      toast.error("Partner, campaign, and criteria are required.");
      return;
    }
    if (creators.length === 0) {
      toast.error("Select at least one creator first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/export_brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner: partner.trim(),
          campaign: campaign.trim(),
          criteria: criteria.trim(),
          month_year: monthYear.trim() || undefined,
          creator_ids: creators.map((c) => c.id),
          statuses,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      toast.success("Brief ready", {
        description: (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open in Google Docs
            <ExternalLink className="h-3 w-3" />
          </a>
        ),
        duration: 15_000,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(`Brief failed: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Brief</DialogTitle>
          <DialogDescription>
            Creates a Google Doc matching Recast's brief format for the{" "}
            <strong>{creators.length}</strong> selected creator
            {creators.length === 1 ? "" : "s"}. Shared with your email.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onGenerate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="b-partner">Partner</Label>
              <Input
                id="b-partner"
                required
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                placeholder="Brand or agency name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-campaign">Campaign title</Label>
              <Input
                id="b-campaign"
                required
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Campaign name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="b-criteria">Criteria</Label>
            <textarea
              id="b-criteria"
              required
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              rows={4}
              placeholder="Describe the campaign requirements: focus geographies, platform preferences, CCV range, content style, scheduling windows, and any creator attributes that matter."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="b-month">Month / Year</Label>
              <Input
                id="b-month"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                placeholder="April 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Shared with</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {email || "(not signed in)"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Per-creator status</Label>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {creators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="flex-1 truncate">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.country || "—"} · {c.twitch_handle ? `twitch.tv/${c.twitch_handle}` : c.kick_handle ? `kick.com/${c.kick_handle}` : "no handle"}
                    </div>
                  </div>
                  <Select
                    value={statuses[c.id] ?? "Pending Review"}
                    onValueChange={(v) =>
                      setStatuses((prev) => ({ ...prev, [c.id]: v }))
                    }
                  >
                    <SelectTrigger className="h-7 w-[220px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || creators.length === 0}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" /> Generate Brief
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
