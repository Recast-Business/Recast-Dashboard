import { Construction } from "lucide-react";

interface Props {
  section: string;
  detail?: string;
}

/**
 * Stub page shown while a section is mid-rebuild.
 * Used for /campaigns and /finance during the Gustavo Finance overhaul
 * (Phase A → Phase F) — the underlying schema changed and the old pages
 * would 500. This stub keeps the route alive and tells the user when
 * to expect the new version.
 */
export function RebuildingPage({ section, detail }: Props) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md space-y-4 rounded-lg border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Construction className="h-6 w-6" />
        </div>
        <h1 className="text-h3 tracking-tight">{section} is being rebuilt</h1>
        <p className="text-sm text-muted-foreground">
          {detail ??
            "We're upgrading this section with new finance, vendor and campaign tooling. The previous version has been retired and the new one will be back online shortly."}
        </p>
        <p className="text-xs text-muted-foreground">
          If you need access to the old data, sign in to Supabase Studio or
          message Max.
        </p>
      </div>
    </div>
  );
}
