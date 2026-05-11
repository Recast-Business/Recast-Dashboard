-- 0017_creator_ccv.sql
-- 30-day average CCV fields for creators (mostly used on Leads).
-- twitch_30d_ccv: auto-fetched from TwitchTracker via /api/ccv30.
-- kick_30d_ccv: manual entry (Kick has no reliable server-side 30d CCV API).
-- ccv_fetched_at: last time either value was written.

alter table creators add column if not exists twitch_30d_ccv integer;
alter table creators add column if not exists kick_30d_ccv integer;
alter table creators add column if not exists ccv_fetched_at timestamptz;

create index if not exists creators_twitch_30d_idx on creators(twitch_30d_ccv);
create index if not exists creators_kick_30d_idx on creators(kick_30d_ccv);
