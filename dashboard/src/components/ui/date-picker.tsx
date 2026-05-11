import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  /** ISO date string (YYYY-MM-DD) or empty/null. */
  value: string | null | undefined;
  /** Receives an ISO date string (YYYY-MM-DD) or null when cleared. */
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Show a small "Clear" button on the popover footer. Defaults to true. */
  allowClear?: boolean;
  /** Constrain selectable range. */
  minDate?: Date;
  maxDate?: Date;
  /** Optional id for label association. */
  id?: string;
}

/**
 * Drop-in replacement for `<input type="date">`.
 * Renders a button → popover → calendar, value flows as YYYY-MM-DD.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  allowClear = true,
  minDate,
  maxDate,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false);

  const date = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  function handleSelect(d: Date | undefined) {
    if (!d) {
      onChange(null);
    } else {
      onChange(format(d, "yyyy-MM-dd"));
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-start font-normal",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">
            {date ? format(date, "MMM d, yyyy") : placeholder}
          </span>
          {allowClear && date && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange(null);
              }}
              className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          autoFocus
          disabled={
            minDate || maxDate
              ? (d) =>
                  (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false)
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
