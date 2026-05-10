# Sample data — Overview page

These two SQL files populate the dashboard with enough fake data for
the Overview page to render its full populated state (overdue banner,
12-month cash flow chart, top-talent / top-vendor lists with
avatars and progress bars, sidebar count badges).

Useful for:

- Visual review with Gustavo / Frazier
- Screenshots that match the Claude Design mockup
- Validating typography + layout before real production data flows in

## Files

| File | What it does |
|---|---|
| `sample-overview.sql` | Inserts `[SEED]`-tagged rows into 11 tables |
| `sample-overview-cleanup.sql` | Deletes every `[SEED]`-tagged row in reverse-FK order |

## Run

1. Open Supabase Studio → **SQL Editor**.
2. Paste `sample-overview.sql` → **Run**. Should complete in ~1s.
3. Refresh the live dashboard. Overview should now look like the mockup.
4. When you're done reviewing, paste `sample-overview-cleanup.sql` → **Run**.
   Real production data is untouched.

## Safety

Every inserted row has `notes = '[SEED]'` and a deterministic UUID
prefix (`00000001-0001-...` for creators, `00000002-...` for vendors,
etc.). The cleanup script ONLY deletes rows where `notes = '[SEED]'`,
so editing seeded rows in the UI (e.g. ticking a box) won't break
cleanup as long as the `notes` field is preserved.

The seed script is idempotent — running it twice is a no-op (the
`pre-clean` step at the top removes any prior seed before re-inserting).

## What gets seeded

- **20 creators** — 14 signed (4 starred), 6 unsigned (Leads)
- **9 vendors** — 5 with May 2026 activity (Adobe, Restream, Cloudflare,
  Frame.io, Linear) + 4 quieter vendors (Notion, Vercel, 1Password, Loom)
- **1 house resident** (Dan Mosley, $800/mo)
- **1 house utility** (Power)
- **4 OnlyFans deals** (Charlotte, BaldyBronson, Frazier Lin, Dani Voss)
- **24 payment receipts** for 2026 + **24 for 2025** (drives cash flow chart)
- **9 May 2026 talent + vendor performance rows** (drives Top Talent /
  Top Vendor lists)
- **6 overdue items** across all 6 sources (vendor / OnlyFans / Telegram /
  talent invoice / rent / utility) — drives the red banner + Most Overdue list

## Notes on month-relative data

The "this month" lists (Top Talent / Top Vendor) and the "days late"
calculation are anchored to **today's date** by `useFinanceOverview`.
The seed targets May 2026 for current-month data and Apr/Jun 2026 for
overdue. If today is significantly before or after May 2026 you may
see fewer items in the lists — that's working as intended (the hook
filters to the actual current month). To force a populated current-
month view at any time, edit the `period_year`/`period_month` literals
near the bottom of `sample-overview.sql`.
