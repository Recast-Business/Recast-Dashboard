import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUpdateCreatorProfile,
  type CreatorProfilePatch,
} from "@/hooks/useCreators";

/**
 * Full editable profile per creator (Phase J).
 *
 * Beyond the basics (name, country, contract terms) it carries the fields
 * needed for invoicing — legal name, business name, email/phone/address,
 * payment method preference, tax ID, and a per-platform commission %.
 *
 * Phase K-2: commission can be either flat (single % for any gross) or
 * tiered (different % at different gross thresholds, cliff semantics —
 * the higher tier applies to the WHOLE month once crossed).
 */

/** Per-tier editor row. Stored as strings while the user is typing so
 *  blank values + "0" stay distinguishable. */
interface TierEditor {
  threshold: string;
  pct: string;
}

interface CreatorMinimal {
  id: string;
  name: string;
  country: string | null;
  category: string | null;
  contract_terms: string | null;
  socials: Record<string, string>;
  legal_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  payment_method_pref?: string | null;
  tax_id?: string | null;
  commission_pct_by_platform?: Record<
    string,
    number | null | Array<{ threshold: number; pct: number }>
  > | null;
  /** Round 3 (0034): map of platform slug → agreement URL. */
  agreement_links?: Record<string, string> | null;
  /** Round 3 Q1+Q7 (migration 0035): canonical tier column. Each
   *  platform array ascends by threshold; the last entry has
   *  threshold:null meaning "and above". Read here as the future
   *  source of truth — commit 2 (calc rewrite) flips writes off the
   *  legacy column onto this one. */
  commission_tiers?: Record<
    string,
    Array<{ threshold: number | null; pct: number }>
  > | null;
  /** Round 3 Q1 (migration 0035): TRUE = legacy cliff math for this
   *  creator. FALSE / undefined = progressive (default). The dialog
   *  surfaces this as a "Legacy cliff math" toggle for grandfathered
   *  contracts. */
  commission_uses_cliff?: boolean | null;
  /** Round 4 B (migration 0039): tag this creator for 1099 tracking. */
  requires_tax_info?: boolean | null;
  /** Round 4 B: signed W9 link (Drive/Dropbox), valid forever. */
  w9_url?: string | null;
  /** Round 4 B: timestamp the W9 was received. */
  w9_received_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creator: CreatorMinimal;
}

const PLATFORMS: { key: string; label: string }[] = [
  { key: "onlyfans", label: "OnlyFans" },
  { key: "telegram", label: "Telegram" },
  { key: "efuse", label: "Overlay" }, // display-only rename
];

/** Round 3: list of agreement-link slots shown in the profile dialog.
 *  Open-ended slugs — keys not on this list are preserved as-is on save
 *  so future platforms can be added without code changes. */
const AGREEMENT_PLATFORMS: { key: string; label: string }[] = [
  { key: "onlyfans", label: "OnlyFans agreement" },
  { key: "telegram", label: "Telegram agreement" },
  { key: "overlay", label: "Ad Overlay agreement" },
  { key: "deal", label: "Brand-deal master" },
  { key: "other", label: "Other / generic" },
];

export function CreatorProfileDialog({ open, onOpenChange, creator }: Props) {
  const update = useUpdateCreatorProfile();

  // Display name + everyday fields
  const [name, setName] = React.useState(creator.name);
  const [country, setCountry] = React.useState(creator.country ?? "");
  const [category, setCategory] = React.useState(creator.category ?? "");

  // Profile / invoicing
  const [legalName, setLegalName] = React.useState(creator.legal_name ?? "");
  const [businessName, setBusinessName] = React.useState(creator.business_name ?? "");
  const [email, setEmail] = React.useState(creator.email ?? "");
  const [phone, setPhone] = React.useState(creator.phone ?? "");
  const [address, setAddress] = React.useState(creator.address ?? "");
  const [paymentPref, setPaymentPref] = React.useState(creator.payment_method_pref ?? "");
  const [taxId, setTaxId] = React.useState(creator.tax_id ?? "");

  // Commission per platform — empty array means "no deal on this platform"
  const [tiersByPlatform, setTiersByPlatform] = React.useState<Record<string, TierEditor[]>>(
    () => loadTiersFromCreator(creator),
  );

  // R3 Q1 (migration 0035): per-creator legacy cliff math toggle.
  // Default false = progressive (R3 decision B); flip on for
  // grandfathered creators whose contracts were negotiated under cliff.
  const [usesCliff, setUsesCliff] = React.useState<boolean>(
    () => !!creator.commission_uses_cliff,
  );

  // R4 B (migration 0039): per-creator tax-tracker opt-in. When TRUE
  // the creator surfaces on /tax and is held to the W9 completeness
  // rule on /talents. Sub-state: W9 link + received-at.
  const [requiresTax, setRequiresTax] = React.useState<boolean>(
    () => !!creator.requires_tax_info,
  );
  const [w9Url, setW9Url] = React.useState<string>(creator.w9_url ?? "");
  const [w9Received, setW9Received] = React.useState<boolean>(
    !!creator.w9_received_at,
  );

  // Round 3: agreement links — { platform_slug: url } map.
  const [agreementLinks, setAgreementLinks] = React.useState<Record<string, string>>(
    () => (creator.agreement_links && typeof creator.agreement_links === "object"
      ? creator.agreement_links
      : {}),
  );

  // Multi-platform usernames (kept on socials JSON — already exists)
  const initialSocials = creator.socials ?? {};
  const [twitchHandle, setTwitchHandle] = React.useState(initialSocials.twitch ?? "");
  const [kickHandle, setKickHandle] = React.useState(initialSocials.kick ?? "");
  const [instagram, setInstagram] = React.useState(initialSocials.instagram ?? "");
  const [twitter, setTwitter] = React.useState(initialSocials.twitter ?? "");
  const [ofPage1, setOfPage1] = React.useState(initialSocials.of_page_1 ?? "");
  const [ofPage2, setOfPage2] = React.useState(initialSocials.of_page_2 ?? "");
  const [telegramUser, setTelegramUser] = React.useState(initialSocials.telegram ?? "");

  React.useEffect(() => {
    if (!open) return;
    // Reset state if dialog re-opens for a different creator
    setName(creator.name);
    setCountry(creator.country ?? "");
    setCategory(creator.category ?? "");
    setLegalName(creator.legal_name ?? "");
    setBusinessName(creator.business_name ?? "");
    setEmail(creator.email ?? "");
    setPhone(creator.phone ?? "");
    setAddress(creator.address ?? "");
    setPaymentPref(creator.payment_method_pref ?? "");
    setTaxId(creator.tax_id ?? "");
    setTiersByPlatform(loadTiersFromCreator(creator));
    setUsesCliff(!!creator.commission_uses_cliff);
    setRequiresTax(!!creator.requires_tax_info);
    setW9Url(creator.w9_url ?? "");
    setW9Received(!!creator.w9_received_at);
    setAgreementLinks(
      creator.agreement_links && typeof creator.agreement_links === "object"
        ? creator.agreement_links
        : {},
    );
    const s = creator.socials ?? {};
    setTwitchHandle(s.twitch ?? "");
    setKickHandle(s.kick ?? "");
    setInstagram(s.instagram ?? "");
    setTwitter(s.twitter ?? "");
    setOfPage1(s.of_page_1 ?? "");
    setOfPage2(s.of_page_2 ?? "");
    setTelegramUser(s.telegram ?? "");
  }, [open, creator]);

  async function onSave() {
    if (!name.trim()) return toast.error("Name is required.");
    let canonicalTiers: Record<string, Array<{ threshold: number | null; pct: number }>>;
    try {
      canonicalTiers = serializeTiers(tiersByPlatform);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }

    const socials: Record<string, string> = {};
    if (twitchHandle.trim()) socials.twitch = twitchHandle.trim();
    if (kickHandle.trim()) socials.kick = kickHandle.trim();
    if (instagram.trim()) socials.instagram = instagram.trim();
    if (twitter.trim()) socials.twitter = twitter.trim();
    if (ofPage1.trim()) socials.of_page_1 = ofPage1.trim();
    if (ofPage2.trim()) socials.of_page_2 = ofPage2.trim();
    if (telegramUser.trim()) socials.telegram = telegramUser.trim();

    // Round 3: serialise agreement links — strip empty values so the
    // stored jsonb only carries real URLs. Keys are preserved verbatim
    // (open-ended slugs).
    const cleanLinks: Record<string, string> = {};
    for (const [slug, url] of Object.entries(agreementLinks)) {
      const trimmed = (url ?? "").trim();
      if (trimmed) cleanLinks[slug] = trimmed;
    }

    const patch: CreatorProfilePatch = {
      name: name.trim(),
      country: country.trim() || null,
      category: category.trim() || null,
      legal_name: legalName.trim() || null,
      business_name: businessName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      payment_method_pref: paymentPref.trim() || null,
      tax_id: taxId.trim() || null,
      // R3 Q1+Q7 (migration 0035): write to the canonical column.
      // Legacy commission_pct_by_platform stays untouched on the row
      // (read-only fallback until migration 0036 drops it).
      commission_tiers: canonicalTiers,
      commission_uses_cliff: usesCliff,
      // R4 B (migration 0039): tax tracker opt-in + W9.
      requires_tax_info: requiresTax,
      w9_url: w9Url.trim() || null,
      w9_received_at: w9Received
        ? (creator.w9_received_at ?? new Date().toISOString())
        : null,
      agreement_links: cleanLinks,
      socials,
    };
    try {
      await update.mutateAsync({ id: creator.id, patch });
      onOpenChange(false);
    } catch {
      // toast already fired
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{creator.name} — profile</DialogTitle>
          <DialogDescription>
            Everything we need to invoice this creator. Commission % per platform
            drives the auto-calculated Recast cut on Telegram + OnlyFans + Overlay
            income tabs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Section title="Display & content">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Display name *" value={name} onChange={setName} autoFocus />
              <Field label="Country" value={country} onChange={setCountry} />
              <Field label="Category" value={category} onChange={setCategory} />
            </div>
          </Section>

          <Section title="Invoicing & contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Legal name" value={legalName} onChange={setLegalName} />
              <Field label="Business / LLC name" value={businessName} onChange={setBusinessName} />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
              <Field
                label="Address"
                value={address}
                onChange={setAddress}
                multiline
                colSpan={2}
              />
              <Field
                label="Payment method preference"
                value={paymentPref}
                onChange={setPaymentPref}
                placeholder=""
                multiline
                colSpan={2}
              />
              <Field label="Tax ID (optional)" value={taxId} onChange={setTaxId} />
            </div>
          </Section>

          {/* R4 B: tax-tracker opt-in. Off by default — only flip on
              for creators that need a 1099. When on, this creator
              surfaces on /tax and the W9 fields below become
              actionable. */}
          <Section
            title="Tax info / 1099"
            help={
              requiresTax
                ? "This creator is tracked on /tax. Use the year-end tax page to log per-year 1099 status + amount reported. Below is the W9 (person-level, valid forever)."
                : "Toggle on for US contractors that need a 1099 issued. They'll then surface on /tax for year-end tracking. Default is off — most creators don't need this."
            }
          >
            <div className="rounded-md border bg-muted/30 px-3 py-2.5">
              <label className="flex items-center gap-2 text-[12.5px] font-medium">
                <input
                  type="checkbox"
                  checked={requiresTax}
                  onChange={(e) => setRequiresTax(e.target.checked)}
                  className="h-4 w-4 accent-[var(--electric)]"
                />
                Requires tax info / 1099
              </label>
            </div>
            {requiresTax ? (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2 grid gap-1.5">
                  <label className="text-[11px] text-muted-foreground">
                    W9 link (Drive/Dropbox)
                  </label>
                  <Input
                    type="url"
                    value={w9Url}
                    onChange={(e) => setW9Url(e.target.value)}
                    placeholder="https://drive.google.com/…"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[11px] text-muted-foreground">
                    W9 status
                  </label>
                  <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={w9Received}
                      onChange={(e) => setW9Received(e.target.checked)}
                      className="h-4 w-4 accent-[var(--electric)]"
                    />
                    Received
                  </label>
                </div>
              </div>
            ) : null}
          </Section>

          <Section
            title="Commission per platform"
            help={
              usesCliff
                ? 'Legacy cliff math is ON for this creator. The single tier the gross reaches applies its pct to the WHOLE month (the old K-2 behaviour). Toggle off to use the new progressive math.'
                : "Single % for any gross, or add tiers for progressive thresholds (income-tax-bracket style: 25% on the first $100K + 20% on anything above = $35K at $150K gross — each tier applies to its slice only, not the whole month)."
            }
          >
            {/* R3 Q1: Legacy cliff math toggle. Per-creator, all-
                platforms (Gustavo's choice — one toggle per contract
                era). Defaults to false; flipping it to true means
                this creator's math reverts to the K-2 whole-month-
                at-one-rate cliff behaviour for grandfathered deals. */}
            <div className="mb-3 flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">
                  Legacy cliff math
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                  Off (default) = progressive — each tier bills its
                  slice. On = legacy cliff — the tier the gross reaches
                  applies its pct to the entire month. Flip on for
                  grandfathered contracts negotiated under the old rule.
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] font-medium">
                <input
                  type="checkbox"
                  checked={usesCliff}
                  onChange={(e) => setUsesCliff(e.target.checked)}
                  className="h-4 w-4 accent-[var(--electric)]"
                  aria-label="Use legacy cliff math for this creator"
                />
                {usesCliff ? "On" : "Off"}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {PLATFORMS.map((p) => (
                <CommissionEditor
                  key={p.key}
                  label={p.label}
                  tiers={tiersByPlatform[p.key] ?? []}
                  onChange={(next) =>
                    setTiersByPlatform((cur) => ({ ...cur, [p.key]: next }))
                  }
                />
              ))}
            </div>
          </Section>

          {/* Round 3 (Gustavo): agreement-link slots per platform.
              Each row shows a URL input + an Open ↗ button that opens
              the document in a new tab — saves Gustavo from having to
              hunt through Google Drive every time he generates an
              invoice. Empty rows are just collapsed into the stored
              jsonb on save. */}
          <Section
            title="Agreements"
            help="Paste the Google Drive / Dropbox link for each signed agreement so it's one click away. Empty rows are ignored on save."
          >
            <div className="space-y-2">
              {AGREEMENT_PLATFORMS.map((p) => {
                const url = agreementLinks[p.key] ?? "";
                return (
                  <div key={p.key} className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
                    <Label className="text-xs text-muted-foreground">{p.label}</Label>
                    <Input
                      type="url"
                      placeholder="https://drive.google.com/…"
                      value={url}
                      onChange={(e) =>
                        setAgreementLinks((cur) => ({ ...cur, [p.key]: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={!url.trim()}
                      onClick={() => window.open(url.trim(), "_blank", "noopener,noreferrer")}
                      title={url.trim() ? "Open agreement in a new tab" : "Paste a URL first"}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> Open
                    </Button>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Platform usernames" help="Add multiple OF pages or other handles as needed.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Twitch" value={twitchHandle} onChange={setTwitchHandle} />
              <Field label="Kick" value={kickHandle} onChange={setKickHandle} />
              <Field label="OnlyFans page 1" value={ofPage1} onChange={setOfPage1} />
              <Field label="OnlyFans page 2" value={ofPage2} onChange={setOfPage2} />
              <Field label="Telegram username" value={telegramUser} onChange={setTelegramUser} />
              <Field label="Instagram" value={instagram} onChange={setInstagram} />
              <Field label="Twitter / X" value={twitter} onChange={setTwitter} />
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Local primitives ────────────────────────────────────────────────

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  colSpan?: number;
}

function Field({
  label, value, onChange, type, placeholder, autoFocus, multiline, colSpan,
}: FieldProps) {
  const colClass = colSpan === 2 ? "col-span-2" : "";
  return (
    <div className={`grid gap-1.5 ${colClass}`}>
      <Label>{label}</Label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}

// ─── Commission editor (Phase K-2) ──────────────────────────────────

/** Per-platform commission editor. Empty array → no deal. One tier with
 *  threshold=0 → flat (renders a single % input). 2+ rows or threshold > 0
 *  → tiered (cliff). */
function CommissionEditor({
  label,
  tiers,
  onChange,
}: {
  label: string;
  tiers: TierEditor[];
  onChange: (next: TierEditor[]) => void;
}) {
  const isFlat = tiers.length === 1 && tiers[0].threshold === "0";
  const isEmpty = tiers.length === 0;

  function setRow(i: number, patch: Partial<TierEditor>) {
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addRow() {
    if (isEmpty) {
      onChange([{ threshold: "0", pct: "" }]);
    } else {
      // Append a new tier with a higher threshold than the highest existing one.
      const max = Math.max(...tiers.map((t) => Number(t.threshold) || 0));
      onChange([...tiers, { threshold: String(max + 10000), pct: "" }]);
    }
  }
  function removeRow(i: number) {
    const next = tiers.filter((_, idx) => idx !== i);
    onChange(next);
  }
  function clear() {
    onChange([]);
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/15 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {!isEmpty && (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] text-muted-foreground hover:text-foreground"
            title="Remove this platform from the creator's deals"
          >
            Clear
          </button>
        )}
      </div>

      {isEmpty ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={addRow}
        >
          <Plus className="mr-1 h-3 w-3" /> Set commission
        </Button>
      ) : isFlat ? (
        <>
          <div className="relative">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tiers[0].pct}
              onChange={(e) => setRow(0, { pct: e.target.value })}
              placeholder="0"
              className="pr-6"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              %
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs"
            onClick={addRow}
          >
            <Plus className="mr-1 h-3 w-3" /> Add tier
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={t.threshold}
                    onChange={(e) => setRow(i, { threshold: e.target.value })}
                    placeholder="0"
                    className="pl-5 text-xs"
                    title="Monthly gross threshold"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">→</span>
                <div className="relative w-20">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={t.pct}
                    onChange={(e) => setRow(i, { pct: e.target.value })}
                    placeholder="0"
                    className="pr-5 text-xs"
                  />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                    %
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Remove tier"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs"
            onClick={addRow}
          >
            <Plus className="mr-1 h-3 w-3" /> Add tier
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Progressive: each tier&apos;s % applies only to its slice of gross
            (the part between this threshold and the next). Income-tax-bracket
            style — Calculator math (R3E) will use this rule.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Tier serialization helpers (Phase K-2) ──────────────────────────

/**
 * R3 Q1+Q7 (migration 0035): the editor's mental model stays as
 * "threshold = tier STARTS at" — that's more intuitive for users
 * negotiating contracts. We translate at the I/O boundary:
 *
 *   load:  canonical column (ends-at) → editor (starts-at)
 *   save:  editor (starts-at)         → canonical column (ends-at)
 *
 * Storage in the new commission_tiers column follows the R3 canonical
 * shape: ascending by threshold, threshold:null on the terminal tier.
 *
 * Legacy commission_pct_by_platform is still accepted on load as a
 * safety net during the cutover window (some rows might predate the
 * 0035 backfill).
 */
function loadTiersFromCreator(
  c: {
    commission_tiers?: Record<string, unknown> | null;
    commission_pct_by_platform?: Record<string, unknown> | null;
  },
): Record<string, TierEditor[]> {
  const out: Record<string, TierEditor[]> = {};
  const canonical = c.commission_tiers ?? {};
  const legacy = c.commission_pct_by_platform ?? {};

  for (const platform of ["onlyfans", "telegram", "efuse"]) {
    // Prefer canonical (new shape) when present.
    const cv = canonical?.[platform];
    if (Array.isArray(cv) && cv.length > 0) {
      out[platform] = canonicalToEditor(cv);
      continue;
    }
    // Legacy fallback. Same shapes as pre-0035: null / flat number /
    // starts-at array. Editor expects starts-at, so the legacy array
    // path is identity.
    const lv = legacy?.[platform];
    if (lv == null) {
      out[platform] = [];
    } else if (typeof lv === "number") {
      out[platform] = [{ threshold: "0", pct: String(lv) }];
    } else if (Array.isArray(lv)) {
      out[platform] = lv
        .filter((t: unknown): t is { threshold: number; pct: number } => {
          const x = t as Record<string, unknown>;
          return typeof x?.threshold === "number" && typeof x?.pct === "number";
        })
        .map((t) => ({ threshold: String(t.threshold), pct: String(t.pct) }));
    } else {
      out[platform] = [];
    }
  }
  return out;
}

/** New-shape array (threshold = ends-at, null on last) → editor's
 *  starts-at shape. Implicit slice 0 starts at $0; slice i starts at
 *  the previous tier's threshold. */
function canonicalToEditor(canonical: unknown[]): TierEditor[] {
  const cleaned: Array<{ threshold: number | null; pct: number }> = [];
  for (const t of canonical) {
    if (
      typeof t === "object" &&
      t !== null &&
      typeof (t as { pct?: unknown }).pct === "number"
    ) {
      const rawT = (t as { threshold?: unknown }).threshold;
      const threshold =
        rawT === null
          ? null
          : typeof rawT === "number"
            ? rawT
            : null;
      cleaned.push({ threshold, pct: (t as { pct: number }).pct });
    }
  }
  if (cleaned.length === 0) return [];
  // Sort: numeric thresholds ascending, null last.
  cleaned.sort((a, b) => {
    if (a.threshold === null) return 1;
    if (b.threshold === null) return -1;
    return a.threshold - b.threshold;
  });
  // Editor row i = { threshold: previous-canonical-threshold (0 for i=0), pct: this tier's pct }
  const out: TierEditor[] = [];
  let prevThreshold = 0;
  for (const tier of cleaned) {
    out.push({ threshold: String(prevThreshold), pct: String(tier.pct) });
    prevThreshold = tier.threshold === null ? prevThreshold : tier.threshold;
  }
  return out;
}

/**
 * Editor → new-shape array for commission_tiers JSONB. Empty platform
 * arrays are omitted from the output entirely so the stored blob
 * stays compact.
 *
 * Throws on validation errors so the caller can toast.
 */
function serializeTiers(
  byPlatform: Record<string, TierEditor[]>,
): Record<string, Array<{ threshold: number | null; pct: number }>> {
  const out: Record<string, Array<{ threshold: number | null; pct: number }>> = {};
  for (const [platform, rows] of Object.entries(byPlatform)) {
    if (rows.length === 0) continue;

    const parsed = rows.map((r, i) => {
      const threshold = Number(r.threshold);
      const pct = Number(r.pct);
      if (!Number.isFinite(threshold) || threshold < 0) {
        throw new Error(`${platform}: tier ${i + 1} threshold must be a non-negative number`);
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new Error(`${platform}: tier ${i + 1} percentage must be 0–100`);
      }
      return { threshold, pct };
    });

    // Sort ascending by start threshold so the on-disk shape is canonical.
    parsed.sort((a, b) => a.threshold - b.threshold);

    // Reject duplicate thresholds.
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].threshold === parsed[i - 1].threshold) {
        throw new Error(
          `${platform}: two tiers with the same threshold ($${parsed[i].threshold})`,
        );
      }
    }

    // Translate starts-at → ends-at: row i's stored threshold = NEXT
    // row's start (or null for the last). pct stays with its row.
    const canonical: Array<{ threshold: number | null; pct: number }> = [];
    for (let i = 0; i < parsed.length; i++) {
      const nextThreshold =
        i + 1 < parsed.length ? parsed[i + 1].threshold : null;
      canonical.push({ threshold: nextThreshold, pct: parsed[i].pct });
    }
    out[platform] = canonical;
  }
  return out;
}
