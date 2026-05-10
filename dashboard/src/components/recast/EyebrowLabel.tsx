import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase L primitive: 11px caps metadata label.
 *
 * Use above a number, KPI, or section header. Inter 600, 0.13em tracked,
 * uppercase. Always paired with `text-steel` unless the label is meant
 * to demand attention (in which case use `text-electric`).
 *
 * See dashboard/docs/DESIGN.md "Typography" + "KPI tile" recipe.
 */
export const EyebrowLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-eyebrow uppercase text-steel", className)}
    {...props}
  />
));
EyebrowLabel.displayName = "EyebrowLabel";
