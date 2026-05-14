import * as React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatUSD } from "@/lib/utils";
import type { UserRole } from "@/types/database";

const PLATFORM_ORDER = [
  "twitch",
  "kick",
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "snapchat",
  "threads",
  "discord",
  "whop",
];

const PLATFORM_CLASS: Record<string, string> = {
  twitch: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  kick: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
  tiktok: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  youtube: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  twitter: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  facebook: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  snapchat: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  threads: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  discord: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  whop: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

interface CreatorFull {
  id: string;
  name: string;
  category: string | null;
  tier: string | null;
  country: string | null;
  signed: boolean;
  signed_at: string | null;
  contract_terms: string | null;
  outreach_status: string | null;
  starred: boolean;
  twitch_handle: string | null;
  kick_handle: string | null;
  twitch_30d_ccv: number | null;
  kick_30d_ccv: number | null;
  socials: Record<string, string>;
  campaigns: {
    id: string;
    cached_earnings: number;
    cached_commission: number;
    payment_status: string;
    campaign: { id: string; name: string; brand: string | null };
  }[];
}

function useCreatorFull(id: string | null) {
  return useQuery({
    queryKey: ["creator-full", id],
    enabled: !!id,
    queryFn: async (): Promise<CreatorFull | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("creators")
        .select(
          `id, name, category, tier, country, signed, signed_at, contract_terms,
           outreach_status, starred,
           twitch_handle, kick_handle, twitch_30d_ccv, kick_30d_ccv, socials,
           campaigns:campaign_creators(
             id, cached_earnings, cached_commission, payment_status,
             campaign:campaigns(id, name, brand)
           )`,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as CreatorFull;
    },
  });
}

interface DetailProps {
  creatorId: string;
  role: UserRole | null;
  showFullLink?: boolean;
}

export function CreatorDetailBody({ creatorId, role, showFullLink = true }: DetailProps) {
  const { data, isLoading, error } = useCreatorFull(creatorId);

  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  if (error)
    return (
      <div className="text-sm text-destructive">{(error as Error).message}</div>
    );
  if (!data)
    return (
      <div className="text-sm text-muted-foreground">Creator not found.</div>
    );

  const socials = resolveSocials(data);
  const socialKeys = [
    ...PLATFORM_ORDER.filter((p) => socials[p]),
    ...Object.keys(socials).filter((k) => !PLATFORM_ORDER.includes(k)),
  ];

  const totalEarnings = data.campaigns.reduce(
    (s, c) => s + Number(c.cached_earnings ?? 0),
    0,
  );
  const totalCommission = data.campaigns.reduce(
    (s, c) => s + Number(c.cached_commission ?? 0),
    0,
  );

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium",
            data.signed
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
              : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
          )}
        >
          {data.signed ? "Signed (Roster)" : "Lead"}
        </span>
        {data.starred && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            ★ Potential
          </span>
        )}
        {data.category && (
          <span className="text-xs text-muted-foreground">· {data.category}</span>
        )}
        {data.country && (
          <span className="text-xs text-muted-foreground">· {data.country}</span>
        )}
        {data.tier && (
          <span className="text-xs text-muted-foreground">· Tier {data.tier}</span>
        )}
        {data.outreach_status && role !== "partner" && (
          <span className="text-xs text-muted-foreground">
            · {data.outreach_status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoBlock label="Twitch 30d CCV">
          {data.twitch_30d_ccv != null ? (
            <span className="tabular-nums font-semibold">
              {data.twitch_30d_ccv.toLocaleString()}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </InfoBlock>
        <InfoBlock label="Kick 30d CCV">
          {data.kick_30d_ccv != null ? (
            <span className="tabular-nums font-semibold">
              {data.kick_30d_ccv.toLocaleString()}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </InfoBlock>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Socials
        </div>
        {socialKeys.length === 0 ? (
          <div className="text-xs text-muted-foreground">None on file.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {socialKeys.map((p) => (
              <a
                key={p}
                href={socials[p]}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:opacity-80",
                  PLATFORM_CLASS[p] ??
                    "bg-muted text-muted-foreground",
                )}
              >
                {p[0].toUpperCase() + p.slice(1)}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            ))}
          </div>
        )}
      </div>

      {data.signed && data.contract_terms && role !== "partner" && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contract terms
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
            {data.contract_terms}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Campaigns ({data.campaigns.length})
          </div>
          {role !== "partner" && data.campaigns.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Total earnings: <strong>{formatUSD(totalEarnings)}</strong> · Commission:{" "}
              <strong>{formatUSD(totalCommission)}</strong>
            </div>
          )}
        </div>
        {data.campaigns.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Not attached to any campaigns yet.
          </div>
        ) : (
          <div className="rounded-md border">
            {data.campaigns.map((cc) => (
              <Link
                key={cc.id}
                to={`/campaigns?open=${cc.campaign?.id ?? ""}`}
                className="flex items-center justify-between border-b px-3 py-2 text-xs last:border-b-0 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {cc.campaign?.name ?? "(deleted campaign)"}
                  </div>
                  {cc.campaign?.brand && (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {cc.campaign.brand}
                    </div>
                  )}
                </div>
                {role !== "partner" && (
                  <div className="flex items-center gap-3 text-[11px] tabular-nums">
                    <span>{formatUSD(Number(cc.cached_earnings ?? 0))}</span>
                    <span className="text-muted-foreground">
                      {cc.payment_status}
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {showFullLink && (
        <Link
          to={`/creators/${data.id}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open full profile <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function resolveSocials(c: CreatorFull): Record<string, string> {
  const merged: Record<string, string> = { ...(c.socials ?? {}) };
  if (!merged.twitch && c.twitch_handle)
    merged.twitch = `https://twitch.tv/${c.twitch_handle}`;
  if (!merged.kick && c.kick_handle)
    merged.kick = `https://kick.com/${c.kick_handle}`;
  return merged;
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export function CreatorDetailDialog({
  creatorId,
  open,
  onOpenChange,
  role,
}: {
  creatorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: UserRole | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Creator</DialogTitle>
          <DialogDescription>
            Full profile and campaign history.
          </DialogDescription>
        </DialogHeader>
        {creatorId && <CreatorDetailBody creatorId={creatorId} role={role} />}
        {!creatorId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
