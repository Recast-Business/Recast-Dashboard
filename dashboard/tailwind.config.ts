import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/*
 * Phase L (full): Recast canonical design tokens are wired here.
 *
 * Naming convention:
 *   • shadcn semantic colours (background/foreground/primary/etc.) keep
 *     pulling from CSS HSL variables for backward compat.
 *   • Recast brand colours are added at top level with stable names
 *     (ash, midnight, steel, rule, paid, partial, overdue, unpaid)
 *     and `electric` for the brand blue ramp — DO NOT collide with
 *     Tailwind's built-in blue palette, which is intentionally left
 *     untouched so existing utilities keep working.
 *
 * See dashboard/docs/DESIGN.md for usage rules.
 */

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // shadcn semantic layer
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },

        // Recast brand surface greys
        ash: "var(--rc-ash)",
        midnight: "var(--rc-midnight)",
        steel: "var(--rc-steel)",
        rule: "var(--rc-rule)",

        // Recast brand blue ramp (namespaced to avoid colliding with
        // Tailwind's default blue palette).
        electric: {
          DEFAULT: "var(--rc-electric)",
          dk: "var(--rc-electric-dk)",
          lt: "var(--rc-electric-lt)",
        },

        // Status enum — fixed colours, never invent new ones.
        paid: "var(--rc-paid)",
        partial: "var(--rc-partial)",
        overdue: "var(--rc-overdue)",
        unpaid: "var(--rc-unpaid)",
      },
      backgroundColor: {
        // Tinted versions of the status enum for pill backgrounds.
        "paid-tint": "var(--rc-paid-tint)",
        "partial-tint": "var(--rc-partial-tint)",
        "overdue-tint": "var(--rc-overdue-tint)",
        "unpaid-tint": "var(--rc-unpaid-tint)",
        "reconcile-tint": "var(--rc-reconcile-tint)",
      },
      borderRadius: {
        // shadcn-compat (drives Card/Dialog/Button defaults)
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Recast canonical aliases
        xs: "var(--r-xs)",
        full: "var(--r-full)",
      },
      spacing: {
        // Canonical tile-gap aliases. (4/6/8 already match Tailwind
        // defaults at 16/24/32px — exposed here as named tokens so
        // intent reads cleanly in components.)
        "tile-sm": "var(--sp-4)",
        "tile-md": "var(--sp-6)",
        "tile-lg": "var(--sp-8)",
      },
      transitionDuration: {
        base: "var(--dur-base)",
      },
      transitionTimingFunction: {
        // Override Tailwind's `ease-out` to the Recast-canonical curve
        // (snappier than the default cubic-bezier(0,0,0.2,1)).
        out: "var(--ease-out)",
      },
      fontFamily: {
        // Inter for everything; Unbounded for headings + wordmark.
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Unbounded", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // ── Recast typography scale ──
        // Six explicit treatments. Three smaller-text variants
        // (eyebrow / pill / meta) cover the nuance the spec calls
        // out — wide-tracked caps for eyebrows, tight uppercase for
        // pills, narrow regular-case for meta lines under amounts.
        // Use these named roles instead of ad-hoc text-xl/2xl combos.

        // Body sizes (always Inter — see index.css base rule)
        meta:    ["11px", { lineHeight: "1.4", letterSpacing: "0.04em", fontWeight: "500" }],
        pill:    ["11px", { lineHeight: "1.4", letterSpacing: "0.06em", fontWeight: "600" }],
        eyebrow: ["11px", { lineHeight: "1.4", letterSpacing: "0.13em", fontWeight: "600" }],
        small:   ["12px", { lineHeight: "1.4", fontWeight: "500" }],
        body:    ["14px", { lineHeight: "1.5", fontWeight: "400" }],

        // Display sizes (always Unbounded — see index.css base rule)
        h3:      ["18px", { lineHeight: "1.3",  letterSpacing: "-0.01em",  fontWeight: "700" }],
        h2:      ["24px", { lineHeight: "1.25", letterSpacing: "-0.02em",  fontWeight: "700" }],
        // KPI-specific display size. Per spec: text-[30px] in the
        // KPI tile recipe — slightly smaller than the page-title
        // display (36px) so the hierarchy reads cleanly.
        kpi:     ["30px", { lineHeight: "1.1",  letterSpacing: "-0.022em", fontWeight: "800" }],
        display: ["36px", { lineHeight: "1.1",  letterSpacing: "-0.022em", fontWeight: "800" }],
      },
    },
  },
  plugins: [animate],
};

export default config;
