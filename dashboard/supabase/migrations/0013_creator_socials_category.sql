-- 0013_creator_socials_category.sql
-- Add socials jsonb (platform -> URL map) and free-text category on creators.
-- The legacy per-platform text columns (twitch_handle, kick_handle, twitter,
-- instagram) are kept for backwards compatibility with the Scout import.

alter table creators add column if not exists socials jsonb not null default '{}'::jsonb;
alter table creators add column if not exists category text;

create index if not exists creators_category_idx on creators(category);
