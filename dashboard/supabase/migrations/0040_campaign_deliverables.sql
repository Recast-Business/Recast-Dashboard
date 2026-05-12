-- 0040_campaign_deliverables.sql
-- Round 5 Sweep 1 (Gustavo, T2): campaigns are deliverables-based, not
-- date-bounded.
--
-- Quote from the call: "There's no start date. It's usually how many
-- posts you make."
--
-- Schema changes:
--   • Add deliverables_count integer (nullable) — replaces end_date as
--     the "how much work" signal in the form. start_date stays nullable
--     and optional for the deals that do have a clear kickoff day.
--   • end_date stays in the schema as nullable text — existing data
--     preserved, no UI exposure on the form (post-Sweep 1).
--   • status stays in the schema as today; the form just defaults
--     'pending' on create + preserves existing values on edit. Card-
--     level actions still toggle it.
--
-- Additive only. No data loss.

alter table campaigns
  add column if not exists deliverables_count integer;

comment on column campaigns.deliverables_count is
  'R5 Sweep 1: number of posts/deliverables agreed for this campaign. '
  'Nullable. Replaces end_date as the primary "scope of work" signal '
  'on the campaign creation form — campaigns are deliverable-based, '
  'not date-bounded.';
