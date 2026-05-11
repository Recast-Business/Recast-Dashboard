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
    let pct: Record<string, number | null | Array<{ threshold: number; pct: number }>>;
    try {
      pct = serializeTiers(tiersByPlatform);
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
      commission_pct_by_platform: pct,
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

          <Section
            title="Commission per platform"
            help="Single % for any gross, or add tiers for progressive thresholds (income-tax-bracket style: 25% on the first $100K + 20% on anything above = $35K at $150K gross — each tier applies to its slice only, not the whole month)."
          >
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

/** Convert the creator's stored commission_pct_by_platform into the editor's
 *  Record<platform, TierEditor[]> shape. Backwards-compat:
 *    null   → []
 *    number → [{threshold: "0", pct: <num>}]
 *    array  → array.map(stringify)
 */
function loadTiersFromCreator(
  c: { commission_pct_by_platform?: Record<string, unknown> | null },
): Record<string, TierEditor[]> {
  const out: Record<string, TierEditor[]> = {};
  const map = c.commission_pct_by_platform ?? {};
  for (const platform of ["onlyfans", "telegram", "efuse"]) {
    const v = map?.[platform];
    if (v == null) {
      out[platform] = [];
    } else if (typeof v === "number") {
      out[platform] = [{ threshold: "0", pct: String(v) }];
    } else if (Array.isArray(v)) {
      out[platform] = v
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

/** Convert the editor state back into the JSONB shape we store. Throws on
 *  invalid input (e.g. blank pct in a tier) so the caller can toast. */
function serializeTiers(
  byPlatform: Record<string, TierEditor[]>,
): Record<string, number | null | Array<{ threshold: number; pct: number }>> {
  const out: Record<string, number | null | Array<{ threshold: number; pct: number }>> = {};
  for (const [platform, rows] of Object.entries(byPlatform)) {
    if (rows.length === 0) {
      out[platform] = null;
      continue;
    }
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
    // Single tier with threshold=0 → store as flat number for compactness
    if (parsed.length === 1 && parsed[0].threshold === 0) {
      out[platform] = parsed[0].pct;
    } else {
      // Sort ascending by threshold so the JSONB on-disk is canonical.
      parsed.sort((a, b) => a.threshold - b.threshold);
      // Reject duplicate thresholds.
      for (let i = 1; i < parsed.length; i++) {
        if (parsed[i].threshold === parsed[i - 1].threshold) {
          throw new Error(`${platform}: two tiers with the same threshold ($${parsed[i].threshold})`);
        }
      }
      out[platform] = parsed;
    }
  }
  return out;
}
