-- seed.sql — run AFTER creating the 5 auth users in Supabase Studio.
-- Replace the uuids below with the actual auth.users ids, then run this block.

-- 1. Assign roles. (Profiles are auto-created by the on_auth_user_created trigger.)
--    update profiles set role = 'admin'   where email = 'bruno@recast.xyz';
--    update profiles set role = 'admin'   where email = 'harry@recast.xyz';
--    update profiles set role = 'admin'   where email = 'max@recast.xyz';
--    update profiles set role = 'partner' where email = 'frazier@recast.xyz';
--    update profiles set role = 'finance' where email = 'gustavo@recast.xyz';

-- 2. Seed a sample brand + campaign + 2 creators + deal structures.
insert into brands (name) values ('Fanatics') on conflict do nothing;

insert into creators (name, twitch_handle, country, tier)
values
  ('Sample Creator A', 'sample_a', 'US', 'Big'),
  ('Sample Creator B', 'sample_b', 'UK', 'Mid')
on conflict do nothing;

-- Example ad-overlay campaign.
with b as (select id from brands where name = 'Fanatics')
insert into campaigns (brand_id, name, status, is_ad_overlay, commission_rate)
select b.id, 'Fanatics Overlay – April 2026', 'active', true, 20.00
from b
on conflict do nothing;
