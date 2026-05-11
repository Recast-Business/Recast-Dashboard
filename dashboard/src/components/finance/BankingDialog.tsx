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
  useBankingDecrypt,
  useUpsertBanking,
  type BankingInput,
} from "@/hooks/useBanking";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editingId: string | null;     // null = creating new
  vendorId: string | null;
  creatorId: string | null;
}

const EMPTY: BankingInput = {
  vendor_id: null,
  creator_id: null,
  bank_name: "",
  account_holder: "",
  account_number: "",
  swift_sort: "",
  aba_iban_bsb_ifsc: "",
  card_brand: "",
  card_last4: "",
  card_holder: "",
  card_expiry: "",
  account_profile: "",
  notes: "",
};

export function BankingDialog({ open, onOpenChange, editingId, vendorId, creatorId }: Props) {
  const upsert = useUpsertBanking();
  const decrypted = useBankingDecrypt(editingId);
  const [form, setForm] = React.useState<BankingInput>(EMPTY);

  React.useEffect(() => {
    if (!open) return;
    if (editingId && decrypted.data) {
      const d = decrypted.data;
      setForm({
        vendor_id: d.vendor_id,
        creator_id: d.creator_id,
        bank_name: d.bank_name ?? "",
        account_holder: d.account_holder ?? "",
        account_number: d.account_number ?? "",
        swift_sort: d.swift_sort ?? "",
        aba_iban_bsb_ifsc: d.aba_iban_bsb_ifsc ?? "",
        card_brand: d.card_brand ?? "",
        card_last4: d.card_last4 ?? "",
        card_holder: d.card_holder ?? "",
        card_expiry: d.card_expiry ?? "",
        account_profile: d.account_profile ?? "",
        notes: d.notes ?? "",
      });
    } else if (!editingId) {
      setForm({ ...EMPTY, vendor_id: vendorId, creator_id: creatorId });
    }
  }, [open, editingId, decrypted.data, vendorId, creatorId]);

  function set<K extends keyof BankingInput>(k: K, v: BankingInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSave() {
    if (form.card_last4 && !/^[0-9]{4}$/.test(form.card_last4)) {
      toast.error("Card last-4 must be exactly 4 digits.");
      return;
    }
    try {
      await upsert.mutateAsync({
        ...form,
        id: editingId,
        vendor_id: vendorId,
        creator_id: creatorId,
        // empty strings → null so we don't store '' as ciphertext-of-empty
        bank_name: form.bank_name?.trim() || null,
        account_holder: form.account_holder?.trim() || null,
        account_number: form.account_number?.trim() || null,
        swift_sort: form.swift_sort?.trim() || null,
        aba_iban_bsb_ifsc: form.aba_iban_bsb_ifsc?.trim() || null,
        card_brand: form.card_brand?.trim() || null,
        card_last4: form.card_last4?.trim() || null,
        card_holder: form.card_holder?.trim() || null,
        card_expiry: form.card_expiry?.trim() || null,
        account_profile: form.account_profile?.trim() || null,
        notes: form.notes?.trim() || null,
      });
      toast.success(editingId ? "Banking record updated" : "Banking record added");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Edit banking record" : "Add banking record"}
          </DialogTitle>
          <DialogDescription>
            Stored encrypted at rest. Every read and write is logged in the audit trail.
            Never enter a full credit card number — last 4 digits only.
          </DialogDescription>
        </DialogHeader>

        {editingId && decrypted.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Decrypting…</div>
        ) : (
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank name" value={form.bank_name} onChange={(v) => set("bank_name", v)} />
              <Field
                label="Account profile"
                value={form.account_profile}
                onChange={(v) => set("account_profile", v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account holder" value={form.account_holder} onChange={(v) => set("account_holder", v)} />
              <Field label="Account number" value={form.account_number} onChange={(v) => set("account_number", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="SWIFT / Sort code"
                value={form.swift_sort}
                onChange={(v) => set("swift_sort", v)}
              />
              <Field
                label="ABA / IBAN / BSB / IFSC"
                value={form.aba_iban_bsb_ifsc}
                onChange={(v) => set("aba_iban_bsb_ifsc", v)}
              />
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                Card (optional — last 4 digits only)
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="grid gap-1.5">
                  <Label>Brand</Label>
                  <Select value={form.card_brand ?? ""} onValueChange={(v) => set("card_brand", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="mastercard">Mastercard</SelectItem>
                      <SelectItem value="amex">American Express</SelectItem>
                      <SelectItem value="discover">Discover</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="Last 4"
                  value={form.card_last4}
                  onChange={(v) => set("card_last4", v.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                />
                <Field label="Card holder" value={form.card_holder} onChange={(v) => set("card_holder", v)} />
                <Field label="Expiry (MM/YY)" value={form.card_expiry} onChange={(v) => set("card_expiry", v)} placeholder="MM/YY" />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bk-notes">Notes</Label>
              <textarea
                id="bk-notes"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
