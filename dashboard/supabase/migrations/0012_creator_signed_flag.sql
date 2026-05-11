-- 0012_creator_signed_flag.sql
-- Distinguish signed Recast creators (Roster) from scouted/contacted prospects (Leads).
-- Every creator currently in the table is treated as a Lead by default; signed = false.

alter table creators add column if not exists signed boolean not null default false;
alter table creators add column if not exists contract_terms text;
alter table creators add column if not exists signed_at timestamptz;

create index if not exists creators_signed_idx on creators(signed);
