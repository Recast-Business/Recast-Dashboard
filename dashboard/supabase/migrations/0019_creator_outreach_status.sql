-- 0019_creator_outreach_status.sql
-- Per-creator outreach status (primarily used on Leads for bulk updates).
-- Free-text so teams can evolve the funnel. The app seeds a standard set
-- (Not Contacted / Outreached / Responded / Interested / In Progress / Signed
-- / Not Interested / Pass / On Hold) but any value is allowed.

alter table creators add column if not exists outreach_status text;

create index if not exists creators_outreach_status_idx on creators(outreach_status);
