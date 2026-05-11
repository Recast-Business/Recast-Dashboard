import { useBankingDecrypt } from "@/hooks/useBanking";

interface Props {
  bankingId: string;
}

/**
 * Calls the SECURITY DEFINER `vault_get_banking` RPC and renders the
 * decrypted sensitive fields. Each render of this component triggers
 * a vault_access_log entry — only mount it when the user explicitly
 * clicks "Reveal".
 */
export function BankingRevealedView({ bankingId }: Props) {
  const { data, isLoading, error } = useBankingDecrypt(bankingId);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Decrypting…</div>;
  }
  if (error) {
    return (
      <div className="text-xs text-destructive">
        Failed to decrypt: {(error as Error).message}
      </div>
    );
  }
  if (!data) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <Field label="Account holder" value={data.account_holder} />
      <Field label="Account number" value={data.account_number} mono />
      <Field label="SWIFT / Sort" value={data.swift_sort} mono />
      <Field label="ABA / IBAN / BSB / IFSC" value={data.aba_iban_bsb_ifsc} mono />
      <Field label="Card holder" value={data.card_holder} />
      <Field label="Card expiry" value={data.card_expiry} mono />
      {data.notes && (
        <div className="col-span-2 mt-1">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</dt>
          <dd className="whitespace-pre-wrap text-xs">{data.notes}</dd>
        </div>
      )}
      <div className="col-span-2 mt-1 text-[10px] italic text-amber-700">
        🔒 Access to these fields is logged. Hide when finished.
      </div>
    </dl>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "text-xs"}>{value}</dd>
    </div>
  );
}
