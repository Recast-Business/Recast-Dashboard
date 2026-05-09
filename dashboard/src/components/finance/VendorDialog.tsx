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

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="v-cname">Contact name</Label>
              <Input
                id="v-cname"
                value={form.contact_name ?? ""}
                onChange={(e) => set("contact_name", e.target.value)}
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
