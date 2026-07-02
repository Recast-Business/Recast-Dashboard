import * as React from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportRowsToPDF } from "@/lib/export/pdf";
import type { CSVColumn } from "@/lib/export/csv";
import { cn } from "@/lib/utils";

interface Props<Row> {
  filename: string;
  title: string;
  subtitle?: string;
  rows: Row[];
  columns: CSVColumn<Row>[];
  label?: string;
  orientation?: "portrait" | "landscape";
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}

/**
 * Drop-in PDF export. Reuses the CSVColumn<Row> shape from csv.ts so
 * every section that already has CSV columns gets PDF for free.
 */
export function ExportPDFButton<Row>({
  filename,
  title,
  subtitle,
  rows,
  columns,
  label = "PDF",
  orientation,
  size = "sm",
  className,
  disabled,
}: Props<Row>) {
  const [busy, setBusy] = React.useState(false);

  // Round-2 performance: exportRowsToPDF is now async — it dynamic-
  // imports the jsPDF engine on first click instead of shipping it in
  // the main bundle. `busy` covers the (one-time) chunk download too.
  async function onClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await exportRowsToPDF({ filename, title, subtitle, rows, columns, orientation });
    } catch (e) {
      toast.error(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const isDisabled = disabled || rows.length === 0 || busy;

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={isDisabled}
      title={
        rows.length === 0
          ? "Nothing to export"
          : `Download ${rows.length} row${rows.length === 1 ? "" : "s"} as PDF`
      }
      className={cn(className)}
    >
      <FileText className="mr-1 h-3.5 w-3.5" /> {label}
    </Button>
  );
}
