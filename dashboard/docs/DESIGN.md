# Recast Dashboard — Design System

> **Read this before adding any new UI.** Every new component, every new
> page should reach for these tokens and recipes first. The whole point
> of the Phase L pass was to stop reinventing buttons.

---

## 1. Token reference

### Surface greys

| Token | Hex | Use |
|---|---|---|
| `bg-ash` | `#111111` | Default card / panel surface (dark mode hero) |
| `bg-midnight` | `#1A1A2A` | Dark-mode page background tint |
| `text-steel` | `#6B7280` | Muted body / secondary metadata |
| `border-rule` | `#1E1E1E` | Hairline separator (1px, replaces shadow) |

### Brand blue ramp

| Token | Hex | Use |
|---|---|---|
| `bg-electric` / `text-electric` | `#2563EB` | Primary CTA, focus ring, active nav |
| `bg-electric-dk` | `#1A4FCC` | Hover / pressed state for primary |
| `bg-electric-lt` | `#3B82F6` | Chart inflow gradient stop, hover lift |

> ⚠️ Do not use Tailwind's built-in `blue-*` palette. The brand blue is
> deliberately darker than `blue-500`; mixing them looks washed out.

### Status enum (fixed — never invent new colours)

| Token | Hex | Tint background | Used for |
|---|---|---|---|
| `text-paid` | `#4ADE80` | `bg-paid-tint` | Cleared invoices, `payment_status='paid'` |
| `text-partial` | `#F59E0B` | `bg-partial-tint` | Underpaid, `payment_status='partial'` |
| `text-overdue` | `#F87171` | `bg-overdue-tint` | Past `due_date`, status not yet paid |
| `text-unpaid` | `#9CA3AF` | `bg-unpaid-tint` | Issued but not yet due |

### Radii

| Token | Px | Use |
|---|---|---|
| `rounded-xs` | 2 | Tag, micro-pill |
| `rounded-sm` | 4 | Input, status pill |
| `rounded-md` | 6 | Button, dropdown |
| `rounded-lg` | 8 | Card, dialog, surface |
| `rounded-full` | 9999 | Avatar, dot indicator |

### Spacing aliases

| Token | Px | Use |
|---|---|---|
| `gap-tile-sm` / `p-tile-sm` | 16 | Compact tile internals |
| `gap-tile-md` / `p-tile-md` | 24 | Default card padding |
| `gap-tile-lg` / `p-tile-lg` | 32 | Page section gap |

> Tailwind's standard `4/6/8` spacing already match these — the named
> tokens just make intent legible (`p-tile-md` reads better than `p-6`
> when the rest of the file is in design-system mode).

### Typography

| Class | Face / weight / size / tracking |
|---|---|
| `text-display` | Unbounded 800 · 36 · −0.022em |
| `text-h2` | Unbounded 700 · 24 · −0.02em |
| `text-h3` | Unbounded 700 · 18 · −0.01em |
| `text-body` | Inter 400 · 14 · 1.5 line-height |
| `text-small` | Inter 500 · 12 |
| `text-eyebrow` | Inter 600 · 11 · 0.13em caps |

Wordmark (the "RECAST" text in the sidebar) is `font-display` weight 800
uppercase with `letter-spacing: 0.08em` — already wired into `Sidebar.tsx`.

Add `.tabular` to any element rendering currency to enable
`font-variant-numeric: tabular-nums`. Required on the invoice grid so
columns line up.

### Motion

| Class | Value | Use |
|---|---|---|
| `duration-base` | 120ms | Hover, focus, status transitions |
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default easing curve |

---

## 2. Component recipes

### Card (default surface)

```tsx
<div className="rounded-lg border border-white/8 bg-ash p-tile-md">
```

**Hairline border carries elevation, never shadow.** The `border-white/8`
gives just enough definition to read as a layer; `shadow-*` is banned
unless you have a real popover / dropdown reason.

### KPI tile

```tsx
<div className="rounded-lg border border-white/8 bg-ash p-tile-md">
  <div className="text-eyebrow text-steel">Inflow this month</div>
  <div className="mt-2 flex items-baseline gap-2">
    <span className="tabular text-display">$118,420</span>
    <span className="tabular text-small text-steel">.00</span>
  </div>
  <div className="mt-1 text-small text-paid">+12.4% vs $105,400 Jun</div>
</div>
```

The decimal portion (`.00`) renders smaller and steel-coloured. The
delta line uses `text-paid` for positive, `text-overdue` for negative.

### Status pill

```tsx
<span className="inline-flex items-center rounded-sm bg-paid-tint px-2 py-0.5 text-eyebrow text-paid">
  PAID
</span>
```

Swap the colour token for `partial` / `overdue` / `unpaid`. **Never
invent a fifth status.** If the data model needs more states, the
status enum must change first (DB → types → UI), not the colour palette.

### Money cell

```tsx
<span className="tabular text-body text-foreground">$1,200</span>
```

Always `.tabular`. Always include the dollar sign inside the cell — the
column header should not say "($)".

### Invoice cell (the cell-is-the-invoice grid)

```tsx
<button className="block w-full rounded-sm border border-rule p-2 text-left transition-colors duration-base hover:bg-electric/5">
  <div className="tabular text-body text-foreground">$28,400</div>
  <div className="text-eyebrow text-steel">INV-0362</div>
</button>
```

Each cell is a button — clicking it opens the invoice. Status is
communicated by the cell's left border colour:

```tsx
className={cn(
  "border-l-2",
  status === "paid" && "border-l-paid",
  status === "partial" && "border-l-partial",
  status === "overdue" && "border-l-overdue",
  status === "unpaid" && "border-l-unpaid",
)}
```

### Table row (with sticky-left first column)

```tsx
<table className="w-full">
  <tbody>
    <tr className="border-b border-rule">
      <td className="sticky left-0 bg-ash p-tile-sm">Charlotte Parkes</td>
      <td className="tabular p-tile-sm text-right">$28,400</td>
    </tr>
  </tbody>
</table>
```

Every grid that scrolls horizontally **must** sticky-left the first
column (creator name, vendor name). Without it the user loses context
mid-scroll.

---

## 3. Engineering rules (no-go list)

1. **No shadows on cards.** Hairline border only. Shadows are reserved
   for transient surfaces (Popover, DropdownMenu, Toast).
2. **No emoji in UI strings.** Lucide icons or text. (Comments + commit
   messages are fine.)
3. **No gradients except chart inflow.** The cash-flow chart's inflow
   area uses a vertical gradient `electric-dk → electric-lt`. Outflow
   is solid `#3a3f4b`. Prior-year comparison line is dashed
   `stroke-dasharray="3 4"` at 55% opacity. Nowhere else gets a gradient.
4. **No glow / outer-shadow effects.** Recast is editorial, not gamer.
5. **Status enum is fixed.** Four states, four colours. New requirements
   must change the DB enum first.
6. **Sticky-left creator/vendor column** on every horizontally-scrolling grid.
7. **Sidebar collapses to a 64px rail**, not 0 — keeps icon affordances
   visible. Hover expands.
8. **The reconciliation strip's 4th cell is tinted `bg-reconcile-tint`**
   (Electric Blue at 6% alpha) — this is the visual cue for the
   "Recast keeps" cell on the K-3 ledger footer.
9. **Schema is sacred.** Visual changes never alter the database shape.
   If a new design needs a new field, that's a new migration, written
   first.

---

## 4. When to add new UI — decision tree

```
Need a new visual element?
├── Is it a status / state? → Use status enum + status pill recipe.
│                              If the enum doesn't cover it, extend the
│                              DB enum first, then add the colour.
├── Is it a number? → Use money cell or KPI tile recipe + .tabular.
├── Is it a surface (card, panel, dialog)? → Card recipe.
│                                            Hairline border, no shadow.
├── Is it a navigation affordance? → Sidebar nav item or DropdownMenu.
└── Genuinely new? → Sketch it in the same vocabulary as the recipes
                    above. Open dashboard/docs/DESIGN.md and add it
                    here in the same commit.
```

If none of the above answer the question, stop and ask. The system is
small on purpose — every new primitive is a tax on the next dev who
opens this file.

---

## 5. Where this comes from

Phase L of the upgrade plan ran the canonical brand spec through
Anthropic's Claude Design (April 2026 research preview), seeded with
the Recast brand kit and the Phase K + Phase M codebase. The output:

- `01 _ Overview.html` — Overview page with alert banner + 4-up KPI + cash flow
- `02 _ Finance _ Talent paying us.html` — invoice grid (creator × month)
- `03 _ Vendors _ detail.html` — vendor profile + recurring grid
- `Design system summary.html` — token reference (this doc reflects it)

The four exports live in `~/Downloads/`; the stripped readable copies
sit in `/tmp/recast-{system,overview,talent,vendor}.html`. Treat the
HTML mockups as visual reference only — the source of truth for tokens
is `tailwind.config.ts` + `src/index.css`, and the source of truth for
recipes is **this file**.
