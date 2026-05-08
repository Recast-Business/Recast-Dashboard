import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Themed wrapper around react-day-picker. Used inside the DatePicker
 * popover or anywhere a full month grid is needed.
 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center items-center h-8 mb-1",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1 absolute right-1 top-1",
        button_previous: cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background p-0 hover:bg-accent",
        ),
        button_next: cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background p-0 hover:bg-accent",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-[11px] font-medium uppercase text-muted-foreground",
        week: "flex w-full mt-1",
        day: "relative h-9 w-9 p-0 text-center text-sm",
        day_button: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md p-0 font-normal hover:bg-accent hover:text-accent-foreground",
          "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:font-medium",
        ),
        today: "font-semibold text-primary",
        selected: "bg-primary text-primary-foreground",
        outside: "text-muted-foreground/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground/40",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
