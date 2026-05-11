import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase L primitive: 11px caps metadata label.
 *
 * Inter 600, 0.13em tracked, uppercase. Default colour is steel for
 * subtle metadata; pass `text-electric` etc. via className when the
 * label needs to demand attention.
 *
 * Pass `withRule` to render a 24px Electric Blue horizontal rule
 * BEFORE the text — used on section headers (matches the design
 * system summary's "TAILWIND PALETTE", "TYPOGRAPHY", "TOKENS"
 * headings). For inline metadata above a number, leave it off.
 *
 * See dashboard/docs/DESIGN.md "Typography" + the Eyebrow recipe.
 */
export interface EyebrowLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render a 24px Electric Blue rule before the text. */
  withRule?: boolean;
}

export const EyebrowLabel = React.forwardRef<HTMLDivElement, EyebrowLabelProps>(
  ({ withRule, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "text-eyebrow uppercase text-steel",
        withRule && "inline-flex items-center gap-2 before:block before:h-px before:w-6 before:bg-electric",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
EyebrowLabel.displayName = "EyebrowLabel";
