import * as React from "react";
import { toast } from "sonner";
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
 * Phase K will extend the commission shape to tiered thresholds; for now
 * each platform has a single number.
 */

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
  commission_pct_by_platform?: Record<string, number | null> | null;
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

  // Commission % per platform — null/empty means "no deal on this platform"
  const initialPct = creator.commission_pct_by_platform ?? {};
  const [pctOnlyFans, setPctOnlyFans] = React.useState<string>(
    initialPct.onlyfans != null ? String(initialPct.onlyfans) : "",
  );
  const [pctTelegram, setPctTelegram] = React.useState<string>(
    initialPct.telegram != null ? String(initialPct.telegram) : "",
  );
  const [pctOverlay, setPctOverlay] = React.useState<string>(
    initialPct.efuse != null ? String(initialPct.efuse) : "",
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
    const init = creator.commission_pct_by_platform ?? {};
    setPctOnlyFans(init.onlyfans != null ? String(init.onlyfans) : "");
    setPctTelegram(init.telegram != null ? String(init.telegram) : "");
    setPctOverlay(init.efuse != null ? String(init.efuse) : "");
    const s = creator.socials ?? {};
    setTwitchHandle(s.twitch ?? "");
    setKickHandle(s.kick ?? "");
    setInstagram(s.instagram ?? "");
    setTwitter(s.twitter ?? "");
    setOfPage1(s.of_page_1 ?? "");
    setOfPage2(s.of_page_2 ?? "");
    setTelegramUser(s.telegram ?? "");
  }, [open, creator]);

  function parsePct(raw: string): number | null {
    const v = raw.trim();
    if (!v) return null;
    const n = Number(v);
    if (Number.isNaN(n) || n < 0 || n > 100) return null;
    return n;
  }

  async function onSave() {
    if (!name.trim()) return toast.error("Name is required.");
    const pct: Record<string, number | null> = {};
    pct.onlyfans = parsePct(pctOnlyFans);
    pct.telegram = parsePct(pctTelegram);
    pct.efuse = parsePct(pctOverlay);

    const socials: Record<string, string> = {};
    if (twitchHandle.trim()) socials.twitch = twitchHandle.trim();
    if (kickHandle.trim()) socials.kick = kickHandle.trim();
    if (instagram.trim()) socials.instagram = instagram.trim();
    if (twitter.trim()) socials.twitter = twitter.trim();
    if (ofPage1.trim()) socials.of_page_1 = ofPage1.trim();
    if (ofPage2.trim()) socials.of_page_2 = ofPage2.trim();
    if (telegramUser.trim()) socials.telegram = telegramUser.trim();

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
            title="Commission % per platform"
            help="Leave a field blank if the creator isn't on that platform. Phase K will let you add tiered thresholds (e.g. 30% under $10K → 25% over)."
          >
            <div className="grid grid-cols-3 gap-3">
              {PLATFORMS.map((p) => (
                <div key={p.key} className="grid gap-1.5">
                  <Label>{p.label}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={
                        p.key === "onlyfans"
                          ? pctOnlyFans
                          : p.key === "telegram"
                          ? pctTelegram
                          : pctOverlay
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (p.key === "onlyfans") setPctOnlyFans(v);
                        else if (p.key === "telegram") setPctTelegram(v);
                        else setPctOverlay(v);
                      }}
                      className="pr-6"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              ))}
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
