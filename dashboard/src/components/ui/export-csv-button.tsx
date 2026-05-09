import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportRowsToCSV, type CSVColumn } from "@/lib/export/csv";
import { cn } from "@/lib/utils";

interface Props<Row> {
  filename: string;
  rows: Row[];
  columns: CSVColumn<Row>[];
  /** Override the default "CSV" label. */
  label?: string;
  /** Hide the icon (useful in dense toolbars). */
  iconOnly?: boolean;
  size?: "sm" | "default";
  className?: string;
  /** Disable when there's nothing useful to export. */
  disabled?: boolean;
}

/**
 * Drop-in CSV export button. Fully client-side — no API call, the file is
 * built in-memory and triggered with a hidden <a download>.
 *
 *   <ExportCSVButton
 *     filename={`vendors-${year}.csv`}
 *     rows={data ?? []}
 *     columns={[
 *       { header: "Name", value: (v) => v.name },
 *       { header: "Method", value: (v) => v.payment_method ?? "" },
 *     ]}
 *   />
 */
export function ExportCSVButton<Row>({
  filename, rows, columns, label = "CSV", iconOnly, size = "sm", className, disabled,
}: Props<Row>) {
  const [busy, setBusy] = React.useState(false);

  function onClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      exportRowsToCSV(filename, rows, columns);
    } finally {
      // Re-enable next tick so a quick double-click doesn't spawn duplicates
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
      title={rows.length === 0 ? "Nothing to export" : `Download ${rows.length} row${rows.length === 1 ? "" : "s"} as CSV`}
      className={cn(className)}
    >
      <Download className={cn("h-3.5 w-3.5", !iconOnly && "mr-1")} />
      {!iconOnly && label}
    </Button>
  );
}
