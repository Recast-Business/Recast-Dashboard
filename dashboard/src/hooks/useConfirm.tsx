import * as React from "react";
import { ConfirmDialog, type ConfirmDialogOptions } from "@/components/ui/confirm-dialog";

type ConfirmFn = (opts: ConfirmDialogOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

interface PendingState {
  options: ConfirmDialogOptions;
  resolve: (ok: boolean) => void;
}

/**
 * Wrap the app once near the root. Children get access to `useConfirm()`
 * which returns `(opts) => Promise<boolean>`.
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Delete vendor",
 *     description: "This wipes all monthly payment history.",
 *     confirmLabel: "Delete",
 *     variant: "destructive",
 *   });
 *   if (!ok) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingState | null>(null);

  const confirm: ConfirmFn = React.useCallback((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  function close(ok: boolean) {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) close(false);
          }}
          onConfirm={() => close(true)}
          {...pending.options}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = React.useContext(ConfirmContext);
  if (!fn) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return fn;
}
