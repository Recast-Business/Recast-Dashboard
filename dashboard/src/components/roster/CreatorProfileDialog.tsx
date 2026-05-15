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
import {
  useCreatorAgreements,
  useReplaceCreatorAgreements,
  type CreatorAgreementDraft,
} from "@/hooks/useCreatorAgreements";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  /** Round 3 Q1+Q7 + R5 Sweep 3a (migration 0043): canonical tier
   *  column, now NESTED PER PAGE within each platform:
   *    { platform: { page_name: [{ threshold, pct }, ...] } }
   *  Pre-0043 rows had a flat { platform: [...] } shape and were
   *  migrated to wrap their arrays under page_name "main". The
   *  profile dialog (Sweep 3b) reads + writes the nested shape; the
   *  loader is defensive about legacy flat shapes for any row that
   *  somehow missed the migration. */
  commission_tiers?: Record<
    string,
    Record<string, Array<{ threshold: number | null; pct: number }>>
    | Array<{ threshold: number | null; pct: number }>  // legacy flat fallback
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
  /** R5 Sweep 2 (migration 0042): Min Guarantee on creator level (was
   *  on Telegram deal). */
  min_guarantee?: number | null;
  /** R5 Sweep 2 (migration 0042): contract start date for MG arrangement. */
  contract_start?: string | null;
  /** R5 Sweep 3a (migration 0043): NDA toggle (mirrors vendors). */
  nda_signed?: boolean | null;
  /** R5 Sweep 3a (migration 0043): signed NDA link. */
  nda_url?: string | null;
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

// R5 Sweep 3b: AGREEMENT_PLATFORMS removed. The flat 5-slot
// agreement_links list got replaced by the creator_agreements table
// and its multi-row editor (see AgreementsEditor below) — the new
// flow handles unlimited platforms + amendments per page.

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

  // R5 Sweep 3b: commission editor state is now nested per platform
  // per PAGE. Shape: { platform: { page_name: TierEditor[] } }.
  // "main" is the default page key (matches the 0043 migration
  // backfill). Empty inner record = no deal on this platform.
  const [tiersByPage, setTiersByPage] = React.useState<
    Record<string, Record<string, TierEditor[]>>
  >(() => loadTiersFromCreator(creator));

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

  // R5 Sweep 3b (migration 0043): NDA toggle + URL, mirrors what
  // vendors have. Optional per creator — flip on when an NDA is in
  // place; the URL is the Drive/Dropbox pointer.
  const [ndaSigned, setNdaSigned] = React.useState<boolean>(!!creator.nda_signed);
  const [ndaUrl, setNdaUrl] = React.useState<string>(creator.nda_url ?? "");

  // R5 Sweep 2 (migration 0042): MG + contract_start moved from
  // tele_deals onto the creator profile (Gustavo, T1: "this whole
  // section would be on the talent"). Empty string here, parsed on
  // save — keeps users distinguished from a real 0 value.
  const [minGuarantee, setMinGuarantee] = React.useState<string>(
    creator.min_guarantee != null ? String(creator.min_guarantee) : "",
  );
  const [contractStart, setContractStart] = React.useState<string>(
    creator.contract_start ?? "",
  );

  // R5 Sweep 3b (migration 0043): agreements are now their own table.
  // Fetch existing rows for this creator and hold local drafts for
  // edit. On Save, we delete + bulk-insert via the replace mutation.
  const { data: existingAgreements } = useCreatorAgreements(creator.id);
  const replaceAgreements = useReplaceCreatorAgreements();
  const [agreementDrafts, setAgreementDrafts] = React.useState<CreatorAgreementDraft[]>([]);

  // Seed drafts from the server-fetched agreements once they arrive.
  // Re-seeds when the dialog re-opens for a different creator. We
  // deliberately don't re-seed mid-edit if existingAgreements
  // reference changes — that would clobber user edits in flight.
  const seedKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    if (!existingAgreements) return;
    const seedKey = `${creator.id}::${existingAgreements.length}`;
    if (seedKeyRef.current === seedKey) return;
    seedKeyRef.current = seedKey;
    setAgreementDrafts(
      existingAgreements.map((a) => ({
        id: a.id,
        platform: a.platform,
        page_name: a.page_name,
        label: a.label,
        url: a.url,
        signed_at: a.signed_at,
        notes: a.notes,
        sort_order: a.sort_order,
      })),
    );
  }, [open, creator.id, existingAgreements]);

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
    setTiersByPage(loadTiersFromCreator(creator));
    setUsesCliff(!!creator.commission_uses_cliff);
    setRequiresTax(!!creator.requires_tax_info);
    setW9Url(creator.w9_url ?? "");
    setW9Received(!!creator.w9_received_at);
    setNdaSigned(!!creator.nda_signed);
    setNdaUrl(creator.nda_url ?? "");
    setMinGuarantee(
      creator.min_guarantee != null ? String(creator.min_guarantee) : "",
    );
    setContractStart(creator.contract_start ?? "");
    // R5 Sweep 3b: agreement state is now seeded by the
    // useCreatorAgreements query effect above. No more agreement_links
    // map state to reset here.
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
    // R5 Sweep 3a: serializer now returns nested per-page shape
    // ({ platform: { page_name: tiers[] } }) per migration 0043.
    let canonicalTiers: Record<
      string,
      Record<string, Array<{ threshold: number | null; pct: number }>>
    >;
    try {
      canonicalTiers = serializeTiers(tiersByPage);
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
    // R5 Sweep 3b: agreements are written to their own table (post-Sweep
    // 3a migration 0043). The legacy agreement_links JSON column is no
    // longer written here — only the new creator_agreements rows via
    // useReplaceCreatorAgreements.

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
      // R5 Sweep 2 (migration 0042): MG + contract_start moved off
      // tele_deals. Blank → null; the calc engine treats null as
      // "no MG arrangement" and skips the top-up math.
      min_guarantee: minGuarantee.trim() === "" ? null : Number(minGuarantee),
      contract_start: contractStart || null,
      // R5 Sweep 3b: agreement_links no longer written from the
      // dialog — replaced by the creator_agreements table writes
      // below. Legacy column is read-only fallback during the
      // transition.
      nda_signed: ndaSigned,
      nda_url: ndaUrl.trim() || null,
      socials,
    };
    // Defensive validation: MG must be a non-negative number if set.
    if (
      patch.min_guarantee != null &&
      (!Number.isFinite(patch.min_guarantee) || patch.min_guarantee < 0)
    ) {
      toast.error("Minimum Guarantee must be a non-negative number.");
      return;
    }
    try {
      // 1. Save the creator profile fields (everything except agreements).
      await update.mutateAsync({ id: creator.id, patch });
      // 2. Replace the agreement set with the current drafts. The hook
      //    handles delete-then-bulk-insert atomically enough for our
      //    use case; if it fails, the creator save still landed.
      await replaceAgreements.mutateAsync({
        creator_id: creator.id,
        drafts: agreementDrafts,
      });
      onOpenChange(false);
    } catch {
      // toast already fired by the mutation onError
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
              {/* R5 Sweep 3b (Gustavo, T3): "I'll just take away the
                  sex ID thing" — the standalone Tax ID text input is
                  hidden. The W9 link section below covers the same
                  ground (and is what 1099 prep actually needs). The
                  underlying creators.tax_id column stays present
                  (deprecated) so any historical values aren't
                  destroyed; a cleanup migration drops it after
                  Gustavo confirms the W9 flow. */}
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

          {/* R5 Sweep 3b (Gustavo, T1, migration 0043): NDA on
              creators (mirrors vendor NDA). Toggle on when an NDA is
              in place; URL is the Drive/Dropbox link. */}
          <Section
            title="NDA"
            help="If this creator has signed an NDA, toggle on and paste the link to the document."
          >
            <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
              <label className="flex items-center gap-2 text-[12.5px] font-medium">
                <input
                  type="checkbox"
                  checked={ndaSigned}
                  onChange={(e) => setNdaSigned(e.target.checked)}
                  className="h-4 w-4 accent-[var(--electric)]"
                />
                NDA signed
              </label>
              {ndaSigned ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="nda-url" className="text-[11px] text-muted-foreground">
                    NDA link (optional)
                  </Label>
                  <Input
                    id="nda-url"
                    type="url"
                    value={ndaUrl}
                    onChange={(e) => setNdaUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                  />
                </div>
              ) : null}
            </div>
          </Section>

          {/* R5 Sweep 2 (Gustavo, T1, migration 0042): MG + contract
              start moved off Telegram deals onto the creator profile.
              Optional — most creators don't have an MG arrangement.
              When set, the Telegram calc engine uses this for the
              top-up math; the Telegram deal form no longer asks for
              MG (single source of truth here). */}
          <Section
            title="Minimum Guarantee (Telegram)"
            help='If Recast guarantees this creator a monthly floor, enter the MG amount here. The Telegram calculator uses it for the qualifier + top-up math: net ≥ 50% of MG qualifies the creator, the top-up is MG minus net, and commission applies to (net + top-up). Leave blank for creators without an MG.'
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="mg-amount">
                  MG amount (USD) <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="mg-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={minGuarantee}
                  onChange={(e) => setMinGuarantee(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mg-start">
                  Contract start <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="mg-start"
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                />
              </div>
            </div>
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

            {/* R5 Sweep 3b: per-page commission editor.
                Each platform can have multiple named pages (e.g.
                "Charlotte VIP", "Charlotte Free" on OF). Most
                creators only have one page per platform ("main");
                OF is where multi-page actually matters per
                Gustavo's call (T3). */}
            <div className="space-y-4">
              {PLATFORMS.map((p) => (
                <PerPlatformPagesEditor
                  key={p.key}
                  platformLabel={p.label}
                  pages={tiersByPage[p.key] ?? {}}
                  onChange={(nextPages) =>
                    setTiersByPage((cur) => ({ ...cur, [p.key]: nextPages }))
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
          {/* R5 Sweep 3b (Gustavo, T3): multi-agreement editor. Each
              row = one signed agreement (or amendment). Supports
              multiple agreements per (platform, page). Backed by the
              creator_agreements table from migration 0043. */}
          <Section
            title="Agreements"
            help="One row per signed agreement. Amendments stack as additional rows on the same platform/page. Empty URLs are ignored on save."
          >
            <AgreementsEditor
              drafts={agreementDrafts}
              onChange={setAgreementDrafts}
            />
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

// ─── Per-platform pages editor (R5 Sweep 3b) ────────────────────────
//
// One block per platform. Inside each platform, a list of named pages
// — each page has its own commission tier list. "+ Add page" lets the
// user split a platform into multiple distinct pages (Charlotte VIP
// vs Charlotte Free on OnlyFans).
//
// Page names default to "main" for the canonical single-page case.

function PerPlatformPagesEditor({
  platformLabel,
  pages,
  onChange,
}: {
  platformLabel: string;
  pages: Record<string, TierEditor[]>;
  onChange: (next: Record<string, TierEditor[]>) => void;
}) {
  const pageEntries = Object.entries(pages);
  const hasPages = pageEntries.length > 0;

  function setPageTiers(name: string, next: TierEditor[]) {
    onChange({ ...pages, [name]: next });
  }
  function renamePage(oldName: string, newName: string) {
    if (oldName === newName) return;
    const trimmed = newName.trim() || "main";
    if (trimmed === oldName) return;
    if (pages[trimmed]) {
      // Refuse to overwrite an existing page silently — caller can
      // surface a toast if they want.
      toast.error(
        `Page "${trimmed}" already exists for ${platformLabel}. Pick a different name.`,
      );
      return;
    }
    const next: Record<string, TierEditor[]> = {};
    for (const [k, v] of Object.entries(pages)) {
      next[k === oldName ? trimmed : k] = v;
    }
    onChange(next);
  }
  function removePage(name: string) {
    const next = { ...pages };
    delete next[name];
    onChange(next);
  }
  function addPage() {
    // Pick a name that doesn't collide. "main" if free, else "page 2",
    // "page 3" …
    if (!pages["main"]) {
      onChange({ ...pages, main: [{ threshold: "0", pct: "" }] });
      return;
    }
    let n = 2;
    while (pages[`page ${n}`]) n++;
    onChange({ ...pages, [`page ${n}`]: [{ threshold: "0", pct: "" }] });
  }

  return (
    <div className="rounded-md border bg-muted/10 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{platformLabel}</Label>
        {hasPages ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={addPage}
          >
            <Plus className="mr-1 h-3 w-3" /> Add page
          </Button>
        ) : null}
      </div>

      {!hasPages ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={addPage}
        >
          <Plus className="mr-1 h-3 w-3" /> Set commission for {platformLabel}
        </Button>
      ) : (
        <div className="space-y-3">
          {pageEntries.map(([pageName, tiers]) => (
            <PageCommissionBlock
              key={pageName}
              pageName={pageName}
              tiers={tiers}
              onRename={(next) => renamePage(pageName, next)}
              onTiersChange={(next) => setPageTiers(pageName, next)}
              onRemove={() => removePage(pageName)}
              isOnlyPage={pageEntries.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageCommissionBlock({
  pageName,
  tiers,
  onRename,
  onTiersChange,
  onRemove,
  isOnlyPage,
}: {
  pageName: string;
  tiers: TierEditor[];
  onRename: (next: string) => void;
  onTiersChange: (next: TierEditor[]) => void;
  onRemove: () => void;
  isOnlyPage: boolean;
}) {
  // Local-mirror of the page name so users can type a multi-character
  // name without state-resetting on every keystroke. Committed on
  // blur via onRename — silent dedupe handled by the parent.
  const [draftName, setDraftName] = React.useState(pageName);
  React.useEffect(() => {
    setDraftName(pageName);
  }, [pageName]);

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground">Page</Label>
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => onRename(draftName)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="main"
          className="h-7 max-w-[200px] text-[12px]"
        />
        {!isOnlyPage ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-[11px] text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="Remove this page"
          >
            Remove page
          </Button>
        ) : null}
      </div>
      <CommissionEditor
        label="Tiers"
        tiers={tiers}
        onChange={onTiersChange}
      />
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
/**
 * R5 Sweep 3b: load the FULL nested commission_tiers shape into the
 * editor's `{ platform: { page_name: TierEditor[] } }` structure.
 * Pre-3a legacy flat shape gets wrapped under page "main" so the
 * editor sees a consistent nested form.
 *
 * Pre-Sweep-3 commission_pct_by_platform (cliff-shape) data is
 * loaded as flat fallback under page "main" too.
 */
function loadTiersFromCreator(
  c: {
    commission_tiers?: Record<string, unknown> | null;
    commission_pct_by_platform?: Record<string, unknown> | null;
  },
): Record<string, Record<string, TierEditor[]>> {
  const out: Record<string, Record<string, TierEditor[]>> = {};
  const canonical = c.commission_tiers ?? {};
  const legacy = c.commission_pct_by_platform ?? {};

  for (const platform of ["onlyfans", "telegram", "efuse"]) {
    out[platform] = {};
    const cv = canonical?.[platform];

    if (cv && typeof cv === "object" && !Array.isArray(cv)) {
      // NEW nested shape: { page_name: tiers[] }
      const pages = cv as Record<string, unknown>;
      for (const [pageName, tiers] of Object.entries(pages)) {
        if (Array.isArray(tiers) && tiers.length > 0) {
          out[platform][pageName] = canonicalToEditor(tiers);
        }
      }
      // If at least one page was populated, we're done with this
      // platform — don't fall through to legacy.
      if (Object.keys(out[platform]).length > 0) continue;
    }
    if (Array.isArray(cv) && cv.length > 0) {
      // LEGACY FLAT shape (pre-0043 row). Wrap under "main".
      out[platform].main = canonicalToEditor(cv);
      continue;
    }

    // Pre-Sweep-3 fallback: commission_pct_by_platform (cliff/flat).
    const lv = legacy?.[platform];
    if (lv == null) {
      continue;
    } else if (typeof lv === "number") {
      out[platform].main = [{ threshold: "0", pct: String(lv) }];
    } else if (Array.isArray(lv)) {
      const rows = lv
        .filter((t: unknown): t is { threshold: number; pct: number } => {
          const x = t as Record<string, unknown>;
          return typeof x?.threshold === "number" && typeof x?.pct === "number";
        })
        .map((t) => ({ threshold: String(t.threshold), pct: String(t.pct) }));
      if (rows.length > 0) out[platform].main = rows;
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
 * R5 Sweep 3b: Editor → nested per-page JSONB for commission_tiers.
 *
 * Input shape: `{ platform: { page_name: TierEditor[] } }`
 * Output shape: `{ platform: { page_name: tiers[] } }` (canonical
 * "ends-at" thresholds, last entry has threshold:null).
 *
 * Empty pages are dropped silently. Empty platforms (no pages with
 * tiers) are omitted entirely. Throws on validation errors.
 */
function serializeTiers(
  byPlatform: Record<string, Record<string, TierEditor[]>>,
): Record<string, Record<string, Array<{ threshold: number | null; pct: number }>>> {
  const out: Record<string, Record<string, Array<{ threshold: number | null; pct: number }>>> = {};
  for (const [platform, pages] of Object.entries(byPlatform)) {
    const platformOut: Record<string, Array<{ threshold: number | null; pct: number }>> = {};
    for (const [pageName, rows] of Object.entries(pages)) {
      if (!rows || rows.length === 0) continue;
      const pageLabel = pageName.trim() || "main";

      const parsed = rows.map((r, i) => {
        const threshold = Number(r.threshold);
        const pct = Number(r.pct);
        if (!Number.isFinite(threshold) || threshold < 0) {
          throw new Error(`${platform} · ${pageLabel}: tier ${i + 1} threshold must be a non-negative number`);
        }
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          throw new Error(`${platform} · ${pageLabel}: tier ${i + 1} percentage must be 0–100`);
        }
        return { threshold, pct };
      });

      // Sort ascending by start threshold so the on-disk shape is canonical.
      parsed.sort((a, b) => a.threshold - b.threshold);

      // Reject duplicate thresholds within a page.
      for (let i = 1; i < parsed.length; i++) {
        if (parsed[i].threshold === parsed[i - 1].threshold) {
          throw new Error(
            `${platform} · ${pageLabel}: two tiers with the same threshold ($${parsed[i].threshold})`,
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
      platformOut[pageLabel] = canonical;
    }
    if (Object.keys(platformOut).length > 0) {
      out[platform] = platformOut;
    }
  }
  return out;
}

// ─── R5 Sweep 3b: Agreements editor ─────────────────────────────────
//
// One row per agreement (or amendment). Each row has platform, page,
// label, URL, and the Open ↗ button. Empty URL rows are dropped on
// save. Supports multiple agreements per (platform, page) — that's
// the amendments use case from T3.

const AGREEMENT_PLATFORM_OPTIONS = [
  { value: "onlyfans", label: "OnlyFans" },
  { value: "telegram", label: "Telegram" },
  { value: "efuse", label: "Ad Overlay" },
  { value: "deal", label: "Brand deal" },
  { value: "other", label: "Other" },
] as const;

function AgreementsEditor({
  drafts,
  onChange,
}: {
  drafts: CreatorAgreementDraft[];
  onChange: (next: CreatorAgreementDraft[]) => void;
}) {
  function update(i: number, patch: Partial<CreatorAgreementDraft>) {
    onChange(drafts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) {
    onChange(drafts.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...drafts,
      {
        platform: "onlyfans",
        page_name: "main",
        label: "Agreement",
        url: "",
        sort_order: drafts.length,
      },
    ]);
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/15 px-3 py-3 text-[12px] text-muted-foreground">
        No agreements on file yet.
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-1 h-auto p-0 text-[12px]"
          onClick={add}
        >
          + Add agreement
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {drafts.map((row, i) => (
        <div
          key={row.id ?? `new-${i}`}
          className="grid grid-cols-[140px_120px_140px_1fr_auto_auto] items-center gap-2"
        >
          <Select
            value={row.platform}
            onValueChange={(v) =>
              update(i, { platform: v as CreatorAgreementDraft["platform"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGREEMENT_PLATFORM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={row.page_name}
            onChange={(e) => update(i, { page_name: e.target.value })}
            placeholder="main"
            title="Page name within this platform (e.g. 'Charlotte VIP'). Use 'main' for single-page setups."
          />
          <Input
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Main agreement"
          />
          <Input
            type="url"
            value={row.url}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder="https://drive.google.com/…"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!row.url.trim()}
            onClick={() =>
              window.open(row.url.trim(), "_blank", "noopener,noreferrer")
            }
            title={row.url.trim() ? "Open agreement in a new tab" : "Paste a URL first"}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
            title="Remove this agreement row"
            aria-label="Remove agreement"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-[12px]"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add agreement
      </Button>
    </div>
  );
}
