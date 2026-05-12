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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddVendor,
  useUpdateVendor,
  type VendorInput,
} from "@/hooks/useVendors";
import type {
  Division,
  Vendor,
  VendorKind,
  PaymentMethod,
} from "@/types/finance";

// Phase M-0: Auto Pay removed — utilities (the only place auto-pay was used)
// live under Frazier's House and don't flow through this dialog.
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "paypal", label: "PayPal" },
  { value: "domestic_wire", label: "Domestic Wire" },
  { value: "international_transfer", label: "International Transfer" },
  { value: "bank_ach", label: "Bank ACH" },
  { value: "zelle", label: "Zelle" },
  { value: "invoice_link", label: "Invoice Link" },
  { value: "website_link", label: "Website Link" },
  { value: "credit_card", label: "Credit Card" },
];

// Phase M-0: Division field hidden for `kind="vendor"` rows — Gustavo's
// vendor list is org-wide and doesn't need OF/Telegram/Overlay tagging.
// Talent rows (talent_we_pay / talent_that_pays_us) keep the field until
// M-6 collapses those into the new Talent restructure.
const DIVISIONS: { value: Division | "none"; label: string }[] = [
  { value: "none", label: "Not division-specific" },
  { value: "onlyfans", label: "OnlyFans" },
  { value: "telegram", label: "Telegram" },
  { value: "efuse", label: "Overlay" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When undefined, the dialog opens with no preselected division (user picks). */
  defaultDivision?: Division;
  defaultKind: VendorKind;
  vendor: Vendor | null;       // null = creating
}

export function VendorDialog({ open, onOpenChange, defaultDivision, defaultKind, vendor }: Props) {
  const add = useAddVendor();
  const update = useUpdateVendor();

  const [form, setForm] = React.useState<VendorInput>({
    name: "",
    kind: defaultKind,
    division: defaultDivision ?? null,
    payment_method: null,
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    account_profile: "",
    notes: "",
    active: true,
    username_handle: "",
    nda_signed: false,
    nda_url: "",
    recurring_monthly: false,
    recurring_amount: null,
    requires_tax_info: false,
    w9_url: "",
    w9_received_at: null,
  });

  React.useEffect(() => {
    if (!open) return;
    if (vendor) {
      setForm({
        name: vendor.name,
        kind: vendor.kind,
        division: vendor.division ?? null,
        payment_method: vendor.payment_method,
        contact_name: vendor.contact_name ?? "",
        contact_email: vendor.contact_email ?? "",
        contact_phone: vendor.contact_phone ?? "",
        account_profile: vendor.account_profile ?? "",
        notes: vendor.notes ?? "",
        active: vendor.active,
        username_handle: vendor.username_handle ?? "",
        nda_signed: vendor.nda_signed,
        nda_url: vendor.nda_url ?? "",
        recurring_monthly: vendor.recurring_monthly ?? false,
        recurring_amount: vendor.recurring_amount ?? null,
        requires_tax_info: vendor.requires_tax_info ?? false,
        w9_url: vendor.w9_url ?? "",
        w9_received_at: vendor.w9_received_at ?? null,
      });
    } else {
      setForm({
        name: "",
        kind: defaultKind,
        division: defaultDivision ?? null,
        payment_method: null,
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        account_profile: "",
        notes: "",
        active: true,
        username_handle: "",
        nda_signed: false,
        nda_url: "",
        recurring_monthly: false,
        recurring_amount: null,
        requires_tax_info: false,
        w9_url: "",
        w9_received_at: null,
      });
    }
  }, [open, vendor, defaultDivision, defaultKind]);

  function set<K extends keyof VendorInput>(k: K, v: VendorInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSave() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const patch: VendorInput = {
      ...form,
      name: form.name.trim(),
      contact_name: form.contact_name?.trim() || null,
      contact_email: form.contact_email?.trim() || null,
      contact_phone: form.contact_phone?.trim() || null,
      account_profile: form.account_profile?.trim() || null,
      notes: form.notes?.trim() || null,
      username_handle: form.username_handle?.trim() || null,
      nda_url: form.nda_url?.trim() || null,
      // Round 3A (Gustavo): kind="vendor" rows have no Division. The
      // form already hides the field for vendors, but legacy rows can
      // still carry stale division values. Force-null on save so the
      // data converges with the UI.
      division: defaultKind === "vendor" ? null : form.division,
    };
    try {
      if (vendor) {
        await update.mutateAsync({ id: vendor.id, patch });
        toast.success(`${patch.name} updated`);
      } else {
        await add.mutateAsync(patch);
        toast.success(`${patch.name} added`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  const submitting = add.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit record" : "Add record"}</DialogTitle>
          <DialogDescription>
            Banking and card details are added on the row itself after saving — kept separate so they can be encrypted independently.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className={defaultKind === "vendor" ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
            <div className="grid gap-1.5">
              <Label htmlFor="v-name">Name *</Label>
              <Input
                id="v-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                autoFocus
              />
            </div>
            {defaultKind !== "vendor" && (
              <div className="grid gap-1.5">
                <Label>Division</Label>
                <Select
                  value={form.division ?? "none"}
                  onValueChange={(v) => set("division", v === "none" ? null : (v as Division))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIVISIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Payment method</Label>
              <Select
                value={form.payment_method ?? ""}
                onValueChange={(v) => set("payment_method", (v as PaymentMethod) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-profile">Account profile</Label>
              <Input
                id="v-profile"
                value={form.account_profile ?? ""}
                onChange={(e) => set("account_profile", e.target.value)}
              />
            </div>
          </div>

          {/* R5 Sweep 1 (Gustavo, T2 reversal): Service provided
              field removed. Originally added in R3B; Gustavo asked to
              drop it because "it's going to be listed on the
              invoice". Column dropped by migration 0041. */}

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              {/* R5 Sweep 1 (Gustavo, T2): "Contact name" → "Company name".
                  The top-level Name field already captures the person's
                  name; this slot is the optional legal/company entity
                  the invoice goes to. Not required — some vendors operate
                  under their own name. */}
              <Label htmlFor="v-cname">Company name <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="v-cname"
                value={form.contact_name ?? ""}
                onChange={(e) => set("contact_name", e.target.value)}
                placeholder="e.g. Acme Studios LLC"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-cemail">Contact email</Label>
              <Input
                id="v-cemail"
                type="email"
                value={form.contact_email ?? ""}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-cphone">Contact phone</Label>
              <Input
                id="v-cphone"
                value={form.contact_phone ?? ""}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </div>
          </div>

          {/* Phase M-1: handle field for IM platforms (Discord, Telegram, etc.) */}
          <div className="grid gap-1.5">
            <Label htmlFor="v-handle">Username / handle</Label>
            <Input
              id="v-handle"
              value={form.username_handle ?? ""}
              onChange={(e) => set("username_handle", e.target.value)}
              placeholder="Discord, Telegram, IG handle…"
            />
          </div>

          {/* Phase M-1: NDA toggle + optional URL. The toggle is the source
              of truth — Gustavo wants this on every vendor. The URL is a
              convenience pointer to the signed file in Drive/Dropbox. */}
          <div className="rounded-md border bg-muted/15 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.nda_signed ?? false}
                onChange={(e) => set("nda_signed", e.target.checked)}
              />
              NDA signed
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="v-nda-url" className="text-[11px] text-muted-foreground">
                NDA link (optional)
              </Label>
              <Input
                id="v-nda-url"
                type="url"
                value={form.nda_url ?? ""}
                onChange={(e) => set("nda_url", e.target.value)}
                placeholder="https://drive.google.com/…"
                disabled={!form.nda_signed}
              />
            </div>
          </div>

          {/* Round 4 (Gustavo): opt-in recurring monthly bill. When on,
              the vendor grid renders an "Expected $X" placeholder for
              each unbilled month so logging it becomes a one-click
              confirm. Default OFF — most vendors vary month to month. */}
          <div className="rounded-md border bg-muted/15 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.recurring_monthly ?? false}
                onChange={(e) => {
                  const on = e.target.checked;
                  set("recurring_monthly", on);
                  // Clear amount when turning off so the column doesn't
                  // hold a stale default. User can re-enter on re-enable.
                  if (!on) set("recurring_amount", null);
                }}
              />
              Recurring monthly payment
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="v-recurring-amount"
                  className="text-[11px] text-muted-foreground"
                >
                  Default amount (USD)
                </Label>
                <Input
                  id="v-recurring-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.recurring_amount ?? ""}
                  onChange={(e) =>
                    set(
                      "recurring_amount",
                      e.target.value.trim() === ""
                        ? null
                        : Number(e.target.value),
                    )
                  }
                  placeholder="e.g. 35.00"
                  disabled={!form.recurring_monthly}
                />
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                When on, the vendor grid shows an "Expected" placeholder
                for each unbilled month with this amount pre-filled.
                Click any placeholder to log the real payment.
              </p>
            </div>
          </div>

          {/* Round 4 B: tax tracker opt-in + W9 fields. Off by default;
              flip on for vendors that need a 1099 issued at year-end. */}
          <div className="rounded-md border bg-muted/15 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.requires_tax_info ?? false}
                onChange={(e) => {
                  const on = e.target.checked;
                  set("requires_tax_info", on);
                  if (!on) {
                    set("w9_url", "");
                    set("w9_received_at", null);
                  }
                }}
              />
              Requires tax info / 1099
            </label>
            {form.requires_tax_info ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 grid gap-1.5">
                  <Label
                    htmlFor="v-w9-url"
                    className="text-[11px] text-muted-foreground"
                  >
                    W9 link (valid forever)
                  </Label>
                  <Input
                    id="v-w9-url"
                    type="url"
                    value={form.w9_url ?? ""}
                    onChange={(e) => set("w9_url", e.target.value)}
                    placeholder="https://drive.google.com/…"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    W9 status
                  </Label>
                  <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={!!form.w9_received_at}
                      onChange={(e) =>
                        set(
                          "w9_received_at",
                          e.target.checked ? new Date().toISOString() : null,
                        )
                      }
                    />
                    Received
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-[11px] leading-snug text-muted-foreground">
                When on, this vendor surfaces on the /tax page for
                year-end 1099 tracking. Defaults off — only flip for
                US contractors that hit the 1099 threshold.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="v-notes">Notes</Label>
            <textarea
              id="v-notes"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting ? "Saving…" : vendor ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
