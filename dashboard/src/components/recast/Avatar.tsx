import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase L primitive: 2-letter initial avatar.
 *
 * Hashes the source string into one of 8 brand-safe hues so two
 * creators / vendors with similar initials don't collide visually.
 * Defaults to a circular shape; pass `square` for ad-hoc grid use.
 *
 * Initials are derived from a name like "Charlotte Parkes" → "CP".
 * If only one word is given (e.g. "BaldyBronson") we take the first
 * two consonants/letters: "BB". Email addresses fall back to first
 * two characters of the local part.
 */

const SIZES = {
  // 22px per spec §9 — used in Top Talent / Top Vendor list rows.
  xs: "h-[22px] w-[22px] text-[9.5px] tracking-[0.03em]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
} as const;

// Eight muted, brand-compatible hues. None of them collide with the
// status enum (paid/partial/overdue/unpaid) — those colours are
// reserved for state, not identity.
const PALETTE = [
  "bg-[#1A4FCC] text-white",   // electric-dk
  "bg-[#3B82F6] text-white",   // electric-lt
  "bg-[#1E1E1E] text-white",   // rule
  "bg-[#374151] text-white",   // slate
  "bg-[#4338CA] text-white",   // indigo
  "bg-[#0F766E] text-white",   // teal
  "bg-[#6B7280] text-white",   // steel
  "bg-[#1A1A2A] text-white",   // midnight
];

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Display name used to compute initials and palette index. */
  name: string;
  size?: keyof typeof SIZES;
  shape?: "circle" | "square";
  /**
   * Override the hash-based palette with a fixed tint:
   *   • "talent" — bg rgba(37,99,235,0.18) / colour blue-lt (per spec §9)
   *   • "vendor" — bg rgba(107,114,128,0.18) / colour #d1d5db
   */
  tint?: "auto" | "talent" | "vendor";
}

const TINT_CLASS: Record<NonNullable<AvatarProps["tint"]>, string> = {
  auto: "",
  talent: "bg-[rgba(37,99,235,0.18)] text-electric-lt",
  vendor: "bg-[rgba(107,114,128,0.18)] text-[#d1d5db]",
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  // Strip known separators (—, ·, |) and pick first word + last word.
  const cleaned = trimmed.replace(/[—·|].*$/, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Single token: take first two letters (works for "BaldyBronson" → "BA",
  // "eli@recast.gg" → "EL", etc.)
  const single = parts[0] ?? trimmed;
  return single.slice(0, 2).toUpperCase();
}

function paletteIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % PALETTE.length;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, size = "md", shape = "circle", tint = "auto", className, ...rest }, ref) => {
    const inits = initials(name);
    const palette = tint === "auto" ? PALETTE[paletteIndex(name)] : TINT_CLASS[tint];
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center font-bold",
          SIZES[size],
          shape === "circle" ? "rounded-full" : "rounded-sm",
          palette,
          className,
        )}
        aria-label={name}
        {...rest}
      >
        {inits}
      </div>
    );
  },
);
Avatar.displayName = "Avatar";
