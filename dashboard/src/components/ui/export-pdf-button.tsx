import * as React from "react";
import { FileText } from "lucide-react";
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

  function onClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      exportRowsToPDF({ filename, title, subtitle, rows, columns, orientation });
    } finally {
      setTimeout(() => setBusy(false), 200);
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
