-- 0018_creator_starred.sql
-- Star/Potential shortlist flag on creators.

alter table creators add column if not exists starred boolean not null default false;

create index if not exists creators_starred_idx on creators(starred) where starred = true;
