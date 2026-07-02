import * as React from "react";
import { toast } from "sonner";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
// Round-2 performance: type-only import — the implementation (which
// statically pulls the jsPDF engine) is dynamic-imported at click
// time in onGenerate() so it lives in a lazy chunk, not the main
// bundle every login pays for.
import type { ExportFormat, ExportScope } from "@/lib/export/houseStatement";
import type {
  HouseResident,
  HouseRentPayment,
  HouseUtility,
  HouseUtilityPayment,
  RentGroup,
} from "@/types/finance";
import { cn } from "@/lib/utils";

/**
 * Phase M-4: Filtered House export.
 *
 * Replaces the four standalone export buttons (rent CSV, rent PDF,
 * utility CSV, utility PDF) with one Export button that opens this
 * dialog. Frazier picks who, what scope, and what format — gets the
 * statement he sends out monthly without any manual reformatting.
 *
 * Filter dimensions:
 *   • Recipient — All active residents OR a single resident
 *   • Scope     — Rent only · Utilities only · Both
 *   • Format    — PDF (statement-style with totals + summary) or CSV
 */

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year: number;
  residents: HouseResident[];
  rentGroups: RentGroup[];
  rentByGroup: Record<string, Record<number, HouseRentPayment>>;
  utilities: HouseUtility[];
  utilityByUtility: Record<string, Record<number, HouseUtilityPayment>>;
}

export function HouseExportDialog({
  open,
  onOpenChange,
  year,
  residents,
  rentGroups,
  rentByGroup,
  utilities,
  utilityByUtility,
}: Props) {
  const activeResidents = React.useMemo(
    () => residents.filter((r) => r.active),
    [residents],
  );

  const [recipient, setRecipient] = React.useState<"all" | string>("all");
  const [scope, setScope] = React.useState<ExportScope>("both");
  const [format, setFormat] = React.useState<ExportFormat>("pdf");

  React.useEffect(() => {
    if (!open) return;
    setRecipient("all");
    setScope("both");
    setFormat("pdf");
  }, [open]);

  async function onGenerate() {
    try {
      const { exportHouseStatement } = await import("@/lib/export/houseStatement");
      exportHouseStatement({
        year,
        scope,
        residentIds: recipient === "all" ? null : [recipient],
        format,
        residents,
        rentGroups,
        rentByGroup,
        utilities,
        utilityByUtility,
      });
      toast.success(
        recipient === "all"
          ? `Exported ${activeResidents.length}-resident statement`
          : `Exported statement for ${
              activeResidents.find((r) => r.id === recipient)?.name ?? "resident"
            }`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Export House statement
          </DialogTitle>
          <DialogDescription>
            Generate the report Frazier sends out — pick the recipient,
            what to include, and the format.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Recipient */}
          <div className="grid gap-1.5">
            <Label>Recipient</Label>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={recipient === "all"}
                onClick={() => setRecipient("all")}
                label={`Everyone (${activeResidents.length})`}
              />
              {activeResidents.map((r) => (
                <FilterChip
                  key={r.id}
                  active={recipient === r.id}
                  onClick={() => setRecipient(r.id)}
                  label={r.name}
                />
              ))}
            </div>
          </div>

          {/* Scope */}
          <div className="grid gap-1.5">
            <Label>Include</Label>
            <div className="grid grid-cols-3 gap-2">
              <ScopeChoice
                active={scope === "rent"}
                onClick={() => setScope("rent")}
                label="Rent only"
                hint="Bedroom rent grid + totals"
              />
              <ScopeChoice
                active={scope === "utilities"}
                onClick={() => setScope("utilities")}
                label="Utilities only"
                hint="Per-resident utility shares"
              />
              <ScopeChoice
                active={scope === "both"}
                onClick={() => setScope("both")}
                label="Both"
                hint="Rent + utilities + combined summary"
              />
            </div>
          </div>

          {/* Format */}
          <div className="grid gap-1.5">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              <FormatChoice
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
                icon={<FileText className="h-4 w-4" />}
                label="PDF statement"
                hint="Branded · ready to send"
              />
              <FormatChoice
                active={format === "csv"}
                onClick={() => setFormat("csv")}
                icon={<FileSpreadsheet className="h-4 w-4" />}
                label="CSV"
                hint="Spreadsheet-ready · raw rows"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onGenerate}>
            <Download className="mr-1 h-4 w-4" /> Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-muted/30",
      )}
    >
      {label}
    </button>
  );
}

function ScopeChoice({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border p-2.5 text-left transition",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-muted/30",
      )}
    >
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function FormatChoice({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 text-left transition",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-muted/30",
      )}
    >
      <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
      </span>
    </button>
  );
}
