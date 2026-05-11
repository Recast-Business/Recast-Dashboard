-- 0014_seed_recast_roster.sql
-- Seed the signed Roster with Recast's Master Creator List (April 2026).
-- 66 creators across Male Creator, Male Streamer, Female Creator, Female Streamer.
-- Idempotent and safe against existing scouted creators:
--   * If a creator already exists (by name OR twitch_handle OR kick_handle),
--     UPDATE that record to promote it to signed + fill socials/category.
--   * Otherwise INSERT a new row.

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/iamjonathanpeter", "tiktok": "https://www.tiktok.com/@iamjonathanpeter", "youtube": "https://www.youtube.com/@jonathanpeter", "snapchat": "https://www.snapchat.com/@jonathanpeterrr", "threads": "https://www.threads.com/@iamjonathanpeter"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'iamjonathanpeter'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Jonathan Peters')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Jonathan Peters', 'Male Creator', true, now(), 'active', null, null, 'iamjonathanpeter', null, '{"instagram": "https://www.instagram.com/iamjonathanpeter", "tiktok": "https://www.tiktok.com/@iamjonathanpeter", "youtube": "https://www.youtube.com/@jonathanpeter", "snapchat": "https://www.snapchat.com/@jonathanpeterrr", "threads": "https://www.threads.com/@iamjonathanpeter"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/brad_podray", "youtube": "https://www.youtube.com/@brad_podray/", "tiktok": "https://www.tiktok.com/@brad_podray", "threads": "https://www.threads.com/@brad_podray"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'brad_podray'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Brad Podray')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Brad Podray', 'Male Creator', true, now(), 'active', null, null, 'brad_podray', null, '{"instagram": "https://www.instagram.com/brad_podray", "youtube": "https://www.youtube.com/@brad_podray/", "tiktok": "https://www.tiktok.com/@brad_podray", "threads": "https://www.threads.com/@brad_podray"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/cobypersin", "youtube": "https://www.youtube.com/@coby", "tiktok": "https://www.tiktok.com/@cobyfindsit", "facebook": "https://www.facebook.com/cobypersinshow/", "snapchat": "https://www.snapchat.com/add/itscobypersin"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'cobypersin'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Coby Persin')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Coby Persin', 'Male Creator', true, now(), 'active', null, null, 'cobypersin', null, '{"instagram": "https://www.instagram.com/cobypersin", "youtube": "https://www.youtube.com/@coby", "tiktok": "https://www.tiktok.com/@cobyfindsit", "facebook": "https://www.facebook.com/cobypersinshow/", "snapchat": "https://www.snapchat.com/add/itscobypersin"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/imjoeyreed", "tiktok": "https://www.tiktok.com/@imjoeyreed", "snapchat": "https://www.snapchat.com/@imjoeyreed", "threads": "https://www.threads.com/@imjoeyreed"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'imjoeyreed'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Joey Reed')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Joey Reed', 'Male Creator', true, now(), 'active', null, null, 'imjoeyreed', null, '{"instagram": "https://www.instagram.com/imjoeyreed", "tiktok": "https://www.tiktok.com/@imjoeyreed", "snapchat": "https://www.snapchat.com/@imjoeyreed", "threads": "https://www.threads.com/@imjoeyreed"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/usecodefinisher", "youtube": "https://www.youtube.com/@usecodefinisher", "threads": "https://www.threads.com/@usecodefinisher"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'usecodefinisher'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Finisher')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Finisher', 'Male Creator', true, now(), 'active', null, null, 'usecodefinisher', null, '{"instagram": "https://www.instagram.com/usecodefinisher", "youtube": "https://www.youtube.com/@usecodefinisher", "threads": "https://www.threads.com/@usecodefinisher"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/pasmagic/", "tiktok": "https://www.tiktok.com/@pasmagic", "youtube": "https://www.youtube.com/channel/UC3xjWr5aCjxbjg1JYxmeyRQ", "facebook": "https://www.facebook.com/pasmagic4/", "snapchat": "https://www.snapchat.com/@pasciarrino4", "threads": "https://www.threads.com/@pasmagic"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'pasmagic'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('pasmagic')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'pasmagic', 'Male Creator', true, now(), 'active', null, null, 'pasmagic', null, '{"instagram": "https://www.instagram.com/pasmagic/", "tiktok": "https://www.tiktok.com/@pasmagic", "youtube": "https://www.youtube.com/channel/UC3xjWr5aCjxbjg1JYxmeyRQ", "facebook": "https://www.facebook.com/pasmagic4/", "snapchat": "https://www.snapchat.com/@pasciarrino4", "threads": "https://www.threads.com/@pasmagic"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/foreignbengals", "tiktok": "https://www.tiktok.com/@foreignbengals", "facebook": "https://www.facebook.com/people/Foreign-Bengals/61580134745924/", "snapchat": "https://www.snapchat.com/@foreignbengals"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'foreignbengals'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Foreignbengals')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Foreignbengals', 'Male Creator', true, now(), 'active', null, null, 'foreignbengals', null, '{"instagram": "https://www.instagram.com/foreignbengals", "tiktok": "https://www.tiktok.com/@foreignbengals", "facebook": "https://www.facebook.com/people/Foreign-Bengals/61580134745924/", "snapchat": "https://www.snapchat.com/@foreignbengals"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/cj_socool", "tiktok": "https://www.tiktok.com/@therealcjsocool29", "youtube": "https://www.youtube.com/@CJSOCOOL/featured", "facebook": "https://www.facebook.com/cjsocool.official/", "threads": "https://www.threads.com/@cj_socool"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'cj_socool'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('CJ SO COOL')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'CJ SO COOL', 'Male Creator', true, now(), 'active', null, null, 'cj_socool', null, '{"instagram": "https://www.instagram.com/cj_socool", "tiktok": "https://www.tiktok.com/@therealcjsocool29", "youtube": "https://www.youtube.com/@CJSOCOOL/featured", "facebook": "https://www.facebook.com/cjsocool.official/", "threads": "https://www.threads.com/@cj_socool"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/todderic", "youtube": "https://www.youtube.com/c/toddysmith", "tiktok": "https://tiktok.com/@toddysmith", "twitter": "https://x.com/todderic_", "snapchat": "https://www.snapchat.com/@toddysmithy", "threads": "https://www.threads.com/@todderic"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'todderic'),
    twitter = coalesce(twitter, 'todderic_')
  where lower(name) = lower('Toddy Smith')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Toddy Smith', 'Male Creator', true, now(), 'active', null, null, 'todderic', 'todderic_', '{"instagram": "https://www.instagram.com/todderic", "youtube": "https://www.youtube.com/c/toddysmith", "tiktok": "https://tiktok.com/@toddysmith", "twitter": "https://x.com/todderic_", "snapchat": "https://www.snapchat.com/@toddysmithy", "threads": "https://www.threads.com/@todderic"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/isaiahmiranda22", "tiktok": "https://www.tiktok.com/@isaiahmiranda22", "youtube": "https://www.youtube.com/@IsaiahMiranda22", "facebook": "https://www.facebook.com/IsaiahMiranda22/", "snapchat": "https://www.snapchat.com/@m-isaiah10", "threads": "https://www.threads.com/@isaiahmiranda22"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'isaiahmiranda22'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Isaiah Miranda')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Isaiah Miranda', 'Male Creator', true, now(), 'active', null, null, 'isaiahmiranda22', null, '{"instagram": "https://www.instagram.com/isaiahmiranda22", "tiktok": "https://www.tiktok.com/@isaiahmiranda22", "youtube": "https://www.youtube.com/@IsaiahMiranda22", "facebook": "https://www.facebook.com/IsaiahMiranda22/", "snapchat": "https://www.snapchat.com/@m-isaiah10", "threads": "https://www.threads.com/@isaiahmiranda22"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/cliftonxdean", "youtube": "https://www.youtube.com/@cliftondean", "tiktok": "https://www.tiktok.com/@cliftondean", "facebook": "https://www.facebook.com/cliftonndean", "snapchat": "https://www.snapchat.com/@cliftondeann", "threads": "https://www.threads.com/@cliftonxdean"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'cliftonxdean'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Cliftonxdean')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Cliftonxdean', 'Male Creator', true, now(), 'active', null, null, 'cliftonxdean', null, '{"instagram": "https://www.instagram.com/cliftonxdean", "youtube": "https://www.youtube.com/@cliftondean", "tiktok": "https://www.tiktok.com/@cliftondean", "facebook": "https://www.facebook.com/cliftonndean", "snapchat": "https://www.snapchat.com/@cliftondeann", "threads": "https://www.threads.com/@cliftonxdean"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/jakobgreer", "youtube": "https://www.youtube.com/@greerzylol", "tiktok": "https://www.tiktok.com/@greerzy", "twitter": "https://x.com/greerzylol", "facebook": "https://www.facebook.com/people/Jakob-Greer/61551377297965/", "snapchat": "https://www.snapchat.com/@jakob_greer", "threads": "https://www.threads.com/@jakobgreer"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'jakobgreer'),
    twitter = coalesce(twitter, 'greerzylol')
  where lower(name) = lower('Jakob Greer')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Jakob Greer', 'Male Creator', true, now(), 'active', null, null, 'jakobgreer', 'greerzylol', '{"instagram": "https://www.instagram.com/jakobgreer", "youtube": "https://www.youtube.com/@greerzylol", "tiktok": "https://www.tiktok.com/@greerzy", "twitter": "https://x.com/greerzylol", "facebook": "https://www.facebook.com/people/Jakob-Greer/61551377297965/", "snapchat": "https://www.snapchat.com/@jakob_greer", "threads": "https://www.threads.com/@jakobgreer"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/teeqo", "instagram": "https://www.instagram.com/teeqo", "youtube": "https://www.youtube.com/@teeqo/", "tiktok": "https://www.tiktok.com/@teeqo", "twitter": "https://x.com/teeqo"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'teeqo'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'teeqo'),
    twitter = coalesce(twitter, 'teeqo')
  where lower(name) = lower('Teeqo') or (twitch_handle is not null and lower(twitch_handle) = 'teeqo')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Teeqo', 'Male Streamer', true, now(), 'active', 'teeqo', null, 'teeqo', 'teeqo', '{"twitch": "https://twitch.tv/teeqo", "instagram": "https://www.instagram.com/teeqo", "youtube": "https://www.youtube.com/@teeqo/", "tiktok": "https://www.tiktok.com/@teeqo", "twitter": "https://x.com/teeqo"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/h1ghsky1", "instagram": "https://www.instagram.com/fazeh1ghsky1", "youtube": "https://www.youtube.com/@H1ghSky1", "tiktok": "https://www.tiktok.com/@h1ghskyfr", "twitter": "https://x.com/h1ghsky1", "snapchat": "https://www.snapchat.com/add/realhighsky"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'h1ghsky1'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'fazeh1ghsky1'),
    twitter = coalesce(twitter, 'h1ghsky1')
  where lower(name) = lower('HighSky') or (twitch_handle is not null and lower(twitch_handle) = 'h1ghsky1')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'HighSky', 'Male Streamer', true, now(), 'active', 'h1ghsky1', null, 'fazeh1ghsky1', 'h1ghsky1', '{"twitch": "https://twitch.tv/h1ghsky1", "instagram": "https://www.instagram.com/fazeh1ghsky1", "youtube": "https://www.youtube.com/@H1ghSky1", "tiktok": "https://www.tiktok.com/@h1ghskyfr", "twitter": "https://x.com/h1ghsky1", "snapchat": "https://www.snapchat.com/add/realhighsky"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/cam2r", "instagram": "https://www.instagram.com/cam2r", "youtube": "https://www.youtube.com/cam2r", "tiktok": "https://www.tiktok.com/@totallynotcam"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'cam2r'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'cam2r'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Cam') or (twitch_handle is not null and lower(twitch_handle) = 'cam2r')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Cam', 'Male Streamer', true, now(), 'active', 'cam2r', null, 'cam2r', null, '{"twitch": "https://twitch.tv/cam2r", "instagram": "https://www.instagram.com/cam2r", "youtube": "https://www.youtube.com/cam2r", "tiktok": "https://www.tiktok.com/@totallynotcam"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://www.twitch.tv/teMpeRRR", "instagram": "https://www.instagram.com/temper/", "tiktok": "https://www.tiktok.com/@temperrr", "twitter": "https://x.com/temperrr", "facebook": "https://www.facebook.com/Temperrr/", "snapchat": "https://www.snapchat.com/@temperrrpedic"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'temperrr'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'temper'),
    twitter = coalesce(twitter, 'temperrr')
  where lower(name) = lower('Temper') or (twitch_handle is not null and lower(twitch_handle) = 'temperrr')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Temper', 'Male Streamer', true, now(), 'active', 'temperrr', null, 'temper', 'temperrr', '{"twitch": "https://www.twitch.tv/teMpeRRR", "instagram": "https://www.instagram.com/temper/", "tiktok": "https://www.tiktok.com/@temperrr", "twitter": "https://x.com/temperrr", "facebook": "https://www.facebook.com/Temperrr/", "snapchat": "https://www.snapchat.com/@temperrrpedic"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://m.twitch.tv/khanada_/home", "instagram": "https://www.instagram.com/tsmkhanada/", "youtube": "https://m.youtube.com/@Khanada/videos", "tiktok": "https://www.tiktok.com/@khanadatv", "twitter": "https://x.com/khanada"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'home'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'tsmkhanada'),
    twitter = coalesce(twitter, 'khanada')
  where lower(name) = lower('Khanada') or (twitch_handle is not null and lower(twitch_handle) = 'home')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Khanada', 'Male Streamer', true, now(), 'active', 'home', null, 'tsmkhanada', 'khanada', '{"twitch": "https://m.twitch.tv/khanada_/home", "instagram": "https://www.instagram.com/tsmkhanada/", "youtube": "https://m.youtube.com/@Khanada/videos", "tiktok": "https://www.tiktok.com/@khanadatv", "twitter": "https://x.com/khanada"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/allinabe", "instagram": "https://www.instagram.com/allin.abe", "twitter": "https://x.com/allinabe", "whop": "https://whop.com/allinabe/"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'allinabe'),
    instagram = coalesce(instagram, 'allin.abe'),
    twitter = coalesce(twitter, 'allinabe')
  where lower(name) = lower('Allinabe') or (kick_handle is not null and lower(kick_handle) = 'allinabe')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Allinabe', 'Male Streamer', true, now(), 'active', null, 'allinabe', 'allin.abe', 'allinabe', '{"kick": "https://kick.com/allinabe", "instagram": "https://www.instagram.com/allin.abe", "twitter": "https://x.com/allinabe", "whop": "https://whop.com/allinabe/"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/Samulx", "instagram": "https://www.instagram.com/samulx_/", "youtube": "https://www.youtube.com/@Samulx_YT/featured", "tiktok": "https://www.tiktok.com/@chamuelx", "twitter": "https://x.com/Samulx_"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'samulx'),
    instagram = coalesce(instagram, 'samulx_'),
    twitter = coalesce(twitter, 'samulx_')
  where lower(name) = lower('Samulx') or (kick_handle is not null and lower(kick_handle) = 'samulx')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Samulx', 'Male Streamer', true, now(), 'active', null, 'samulx', 'samulx_', 'samulx_', '{"kick": "https://kick.com/Samulx", "instagram": "https://www.instagram.com/samulx_/", "youtube": "https://www.youtube.com/@Samulx_YT/featured", "tiktok": "https://www.tiktok.com/@chamuelx", "twitter": "https://x.com/Samulx_"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://www.twitch.tv/pgod", "kick": "https://kick.com/pgod", "instagram": "https://www.instagram.com/pgodtv", "youtube": "https://www.youtube.com/channel/UCj0Hm0C8Oun4-D3QRmpp7Bw", "tiktok": "https://www.tiktok.com/@realpgod", "twitter": "https://x.com/pgodtv", "facebook": "https://www.facebook.com/pgodTV/reels/", "discord": "https://discord.com/invite/FmneesEVRJ"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'pgod'),
    kick_handle = coalesce(kick_handle, 'pgod'),
    instagram = coalesce(instagram, 'pgodtv'),
    twitter = coalesce(twitter, 'pgodtv')
  where lower(name) = lower('P God') or (twitch_handle is not null and lower(twitch_handle) = 'pgod') or (kick_handle is not null and lower(kick_handle) = 'pgod')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'P God', 'Male Streamer', true, now(), 'active', 'pgod', 'pgod', 'pgodtv', 'pgodtv', '{"twitch": "https://www.twitch.tv/pgod", "kick": "https://kick.com/pgod", "instagram": "https://www.instagram.com/pgodtv", "youtube": "https://www.youtube.com/channel/UCj0Hm0C8Oun4-D3QRmpp7Bw", "tiktok": "https://www.tiktok.com/@realpgod", "twitter": "https://x.com/pgodtv", "facebook": "https://www.facebook.com/pgodTV/reels/", "discord": "https://discord.com/invite/FmneesEVRJ"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://www.twitch.tv/queasy", "instagram": "https://www.instagram.com/queasy_fn", "youtube": "https://www.youtube.com/channel/UCRHKnYaJTpKC3S4JI6YqtcA", "tiktok": "https://www.tiktok.com/@queasyfn_", "twitter": "https://x.com/QueasyFN"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'queasy'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'queasy_fn'),
    twitter = coalesce(twitter, 'queasyfn')
  where lower(name) = lower('Queasy') or (twitch_handle is not null and lower(twitch_handle) = 'queasy')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Queasy', 'Male Streamer', true, now(), 'active', 'queasy', null, 'queasy_fn', 'queasyfn', '{"twitch": "https://www.twitch.tv/queasy", "instagram": "https://www.instagram.com/queasy_fn", "youtube": "https://www.youtube.com/channel/UCRHKnYaJTpKC3S4JI6YqtcA", "tiktok": "https://www.tiktok.com/@queasyfn_", "twitter": "https://x.com/QueasyFN"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/nickcleveland", "twitch": "https://www.twitch.tv/nickclevland", "instagram": "https://www.instagram.com/nickclevland", "tiktok": "https://www.tiktok.com/@nickclevland", "twitter": "https://x.com/nick_clevland", "discord": "https://discord.com/invite/hafDC98KYn", "threads": "https://www.threads.com/@nickclevland"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'nickclevland'),
    kick_handle = coalesce(kick_handle, 'nickcleveland'),
    instagram = coalesce(instagram, 'nickclevland'),
    twitter = coalesce(twitter, 'nick_clevland')
  where lower(name) = lower('Nick Cleveland') or (twitch_handle is not null and lower(twitch_handle) = 'nickclevland') or (kick_handle is not null and lower(kick_handle) = 'nickcleveland')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Nick Cleveland', 'Male Streamer', true, now(), 'active', 'nickclevland', 'nickcleveland', 'nickclevland', 'nick_clevland', '{"kick": "https://kick.com/nickcleveland", "twitch": "https://www.twitch.tv/nickclevland", "instagram": "https://www.instagram.com/nickclevland", "tiktok": "https://www.tiktok.com/@nickclevland", "twitter": "https://x.com/nick_clevland", "discord": "https://discord.com/invite/hafDC98KYn", "threads": "https://www.threads.com/@nickclevland"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/rdjavi", "instagram": "https://www.instagram.com/rdjavi_", "youtube": "https://www.youtube.com/@RDjavi", "twitter": "https://x.com/RDjavii"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'rdjavi'),
    instagram = coalesce(instagram, 'rdjavi_'),
    twitter = coalesce(twitter, 'rdjavii')
  where lower(name) = lower('RDjavi') or (kick_handle is not null and lower(kick_handle) = 'rdjavi')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'RDjavi', 'Male Streamer', true, now(), 'active', null, 'rdjavi', 'rdjavi_', 'rdjavii', '{"kick": "https://kick.com/rdjavi", "instagram": "https://www.instagram.com/rdjavi_", "youtube": "https://www.youtube.com/@RDjavi", "twitter": "https://x.com/RDjavii"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/cry", "instagram": "https://www.instagram.com/cry_thereal", "youtube": "https://www.youtube.com/@xcryboy", "tiktok": "https://www.tiktok.com/@therealcry", "twitter": "https://x.com/xCryboy"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'cry'),
    instagram = coalesce(instagram, 'cry_thereal'),
    twitter = coalesce(twitter, 'xcryboy')
  where lower(name) = lower('Cry') or (kick_handle is not null and lower(kick_handle) = 'cry')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Cry', 'Male Streamer', true, now(), 'active', null, 'cry', 'cry_thereal', 'xcryboy', '{"kick": "https://kick.com/cry", "instagram": "https://www.instagram.com/cry_thereal", "youtube": "https://www.youtube.com/@xcryboy", "tiktok": "https://www.tiktok.com/@therealcry", "twitter": "https://x.com/xCryboy"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/noorgamer", "instagram": "https://www.instagram.com/noor_gamerrr", "youtube": "https://www.youtube.com/@Noorgamer-kd5wd"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'noorgamer'),
    instagram = coalesce(instagram, 'noor_gamerrr'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('NoorGamer') or (kick_handle is not null and lower(kick_handle) = 'noorgamer')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'NoorGamer', 'Male Streamer', true, now(), 'active', null, 'noorgamer', 'noor_gamerrr', null, '{"kick": "https://kick.com/noorgamer", "instagram": "https://www.instagram.com/noor_gamerrr", "youtube": "https://www.youtube.com/@Noorgamer-kd5wd"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/kingteka", "instagram": "https://www.instagram.com/kingtekaboss", "youtube": "https://www.youtube.com/@KingtekaOficial", "tiktok": "https://www.tiktok.com/@kingtekaoficial"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'kingteka'),
    instagram = coalesce(instagram, 'kingtekaboss'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Kingteka') or (kick_handle is not null and lower(kick_handle) = 'kingteka')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Kingteka', 'Male Streamer', true, now(), 'active', null, 'kingteka', 'kingtekaboss', null, '{"kick": "https://kick.com/kingteka", "instagram": "https://www.instagram.com/kingtekaboss", "youtube": "https://www.youtube.com/@KingtekaOficial", "tiktok": "https://www.tiktok.com/@kingtekaoficial"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/zeko", "instagram": "https://www.instagram.com/federicocristalino", "youtube": "https://www.youtube.com/@FedericoCristalino", "tiktok": "https://www.tiktok.com/@federicocristalino", "twitter": "https://x.com/fedecristalino"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'zeko'),
    instagram = coalesce(instagram, 'federicocristalino'),
    twitter = coalesce(twitter, 'fedecristalino')
  where lower(name) = lower('zEkO') or (kick_handle is not null and lower(kick_handle) = 'zeko')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'zEkO', 'Male Streamer', true, now(), 'active', null, 'zeko', 'federicocristalino', 'fedecristalino', '{"kick": "https://kick.com/zeko", "instagram": "https://www.instagram.com/federicocristalino", "youtube": "https://www.youtube.com/@FedericoCristalino", "tiktok": "https://www.tiktok.com/@federicocristalino", "twitter": "https://x.com/fedecristalino"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/sachauzumaki", "instagram": "https://www.instagram.com/sachauzumaki__", "youtube": "https://www.youtube.com/@sachauzumaki3852", "tiktok": "https://www.tiktok.com/@sachauzumaki_", "twitter": "https://x.com/CarlosDamacen"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'sachauzumaki'),
    instagram = coalesce(instagram, 'sachauzumaki__'),
    twitter = coalesce(twitter, 'carlosdamacen')
  where lower(name) = lower('sachauzumaki') or (kick_handle is not null and lower(kick_handle) = 'sachauzumaki')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'sachauzumaki', 'Male Streamer', true, now(), 'active', null, 'sachauzumaki', 'sachauzumaki__', 'carlosdamacen', '{"kick": "https://kick.com/sachauzumaki", "instagram": "https://www.instagram.com/sachauzumaki__", "youtube": "https://www.youtube.com/@sachauzumaki3852", "tiktok": "https://www.tiktok.com/@sachauzumaki_", "twitter": "https://x.com/CarlosDamacen"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/daarick", "instagram": "https://www.instagram.com/thedaarick28", "youtube": "https://www.youtube.com/@DaarickMinecraft", "tiktok": "https://www.tiktok.com/@daarickoficial", "twitter": "https://x.com/Thedaarick28"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'daarick'),
    instagram = coalesce(instagram, 'thedaarick28'),
    twitter = coalesce(twitter, 'thedaarick28')
  where lower(name) = lower('Daarick') or (kick_handle is not null and lower(kick_handle) = 'daarick')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Daarick', 'Male Streamer', true, now(), 'active', null, 'daarick', 'thedaarick28', 'thedaarick28', '{"kick": "https://kick.com/daarick", "instagram": "https://www.instagram.com/thedaarick28", "youtube": "https://www.youtube.com/@DaarickMinecraft", "tiktok": "https://www.tiktok.com/@daarickoficial", "twitter": "https://x.com/Thedaarick28"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/butisito", "instagram": "https://www.instagram.com/renatorodolfobutilier", "youtube": "https://www.youtube.com/@butisito", "tiktok": "https://www.tiktok.com/@butidota2", "twitter": "https://x.com/Buti_sito"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'butisito'),
    instagram = coalesce(instagram, 'renatorodolfobutilier'),
    twitter = coalesce(twitter, 'buti_sito')
  where lower(name) = lower('BUTIsito') or (kick_handle is not null and lower(kick_handle) = 'butisito')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'BUTIsito', 'Male Streamer', true, now(), 'active', null, 'butisito', 'renatorodolfobutilier', 'buti_sito', '{"kick": "https://kick.com/butisito", "instagram": "https://www.instagram.com/renatorodolfobutilier", "youtube": "https://www.youtube.com/@butisito", "tiktok": "https://www.tiktok.com/@butidota2", "twitter": "https://x.com/Buti_sito"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"kick": "https://kick.com/sideral", "youtube": "https://www.youtube.com/@SiDeRaLDoTa-g4h", "twitter": "https://x.com/SiDeRaLDotA"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'sideral'),
    instagram = coalesce(instagram, null),
    twitter = coalesce(twitter, 'sideraldota')
  where lower(name) = lower('SiDeRaL') or (kick_handle is not null and lower(kick_handle) = 'sideral')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'SiDeRaL', 'Male Streamer', true, now(), 'active', null, 'sideral', null, 'sideraldota', '{"kick": "https://kick.com/sideral", "youtube": "https://www.youtube.com/@SiDeRaLDoTa-g4h", "twitter": "https://x.com/SiDeRaLDotA"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/dalauansparrow", "twitter": "https://x.com/LowTiierGod", "youtube": "https://www.youtube.com/@TheRealLowTierGod", "tiktok": "https://www.tiktok.com/@l0wtiergod", "kick": "https://kick.com/lowtiergod"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'lowtiergod'),
    instagram = coalesce(instagram, 'dalauansparrow'),
    twitter = coalesce(twitter, 'lowtiiergod')
  where lower(name) = lower('LowTierGod') or (kick_handle is not null and lower(kick_handle) = 'lowtiergod')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'LowTierGod', 'Male Streamer', true, now(), 'active', null, 'lowtiergod', 'dalauansparrow', 'lowtiiergod', '{"instagram": "https://www.instagram.com/dalauansparrow", "twitter": "https://x.com/LowTiierGod", "youtube": "https://www.youtube.com/@TheRealLowTierGod", "tiktok": "https://www.tiktok.com/@l0wtiergod", "kick": "https://kick.com/lowtiergod"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/hailblame", "twitter": "https://x.com/hailblame", "tiktok": "https://www.tiktok.com/@hailblame", "kick": "https://kick.com/blame"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'blame'),
    instagram = coalesce(instagram, 'hailblame'),
    twitter = coalesce(twitter, 'hailblame')
  where lower(name) = lower('Blame') or (kick_handle is not null and lower(kick_handle) = 'blame')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Blame', 'Male Streamer', true, now(), 'active', null, 'blame', 'hailblame', 'hailblame', '{"instagram": "https://www.instagram.com/hailblame", "twitter": "https://x.com/hailblame", "tiktok": "https://www.tiktok.com/@hailblame", "kick": "https://kick.com/blame"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/matthewdota", "twitter": "https://x.com/MatthewDotaaa", "kick": "https://kick.com/matthewdota"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'matthewdota'),
    instagram = coalesce(instagram, 'matthewdota'),
    twitter = coalesce(twitter, 'matthewdotaaa')
  where lower(name) = lower('MatthewDota') or (kick_handle is not null and lower(kick_handle) = 'matthewdota')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'MatthewDota', 'Male Streamer', true, now(), 'active', null, 'matthewdota', 'matthewdota', 'matthewdotaaa', '{"instagram": "https://www.instagram.com/matthewdota", "twitter": "https://x.com/MatthewDotaaa", "kick": "https://kick.com/matthewdota"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/neutroogg", "tiktok": "https://www.tiktok.com/@neutroogg", "kick": "https://kick.com/neutroyt"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'neutroyt'),
    instagram = coalesce(instagram, 'neutroogg'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('NeutroYT') or (kick_handle is not null and lower(kick_handle) = 'neutroyt')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'NeutroYT', 'Male Streamer', true, now(), 'active', null, 'neutroyt', 'neutroogg', null, '{"instagram": "https://www.instagram.com/neutroogg", "tiktok": "https://www.tiktok.com/@neutroogg", "kick": "https://kick.com/neutroyt"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/gemelojmc", "twitter": "https://x.com/nickwhitereal", "youtube": "https://www.youtube.com/nickwhite", "tiktok": "https://www.tiktok.com/@nickwhitetiktok", "kick": "https://kick.com/nickwhite"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'nickwhite'),
    instagram = coalesce(instagram, 'gemelojmc'),
    twitter = coalesce(twitter, 'nickwhitereal')
  where lower(name) = lower('nickwhite') or (kick_handle is not null and lower(kick_handle) = 'nickwhite')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'nickwhite', 'Male Streamer', true, now(), 'active', null, 'nickwhite', 'gemelojmc', 'nickwhitereal', '{"instagram": "https://www.instagram.com/gemelojmc", "twitter": "https://x.com/nickwhitereal", "youtube": "https://www.youtube.com/nickwhite", "tiktok": "https://www.tiktok.com/@nickwhitetiktok", "kick": "https://kick.com/nickwhite"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/gemelojmc", "tiktok": "https://www.tiktok.com/@gemelojmc", "kick": "https://kick.com/gemelojmc"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'gemelojmc'),
    instagram = coalesce(instagram, 'gemelojmc'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Gemelojmc') or (kick_handle is not null and lower(kick_handle) = 'gemelojmc')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Gemelojmc', 'Male Streamer', true, now(), 'active', null, 'gemelojmc', 'gemelojmc', null, '{"instagram": "https://www.instagram.com/gemelojmc", "tiktok": "https://www.tiktok.com/@gemelojmc", "kick": "https://kick.com/gemelojmc"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/andreswsalas", "twitter": "https://x.com/AntaurusTV", "youtube": "https://www.youtube.com/channel/UCJKKGUL0WDwSfry7T_bEdRw", "kick": "https://kick.com/antaurus"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'antaurus'),
    instagram = coalesce(instagram, 'andreswsalas'),
    twitter = coalesce(twitter, 'antaurustv')
  where lower(name) = lower('Antaurus') or (kick_handle is not null and lower(kick_handle) = 'antaurus')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Antaurus', 'Male Streamer', true, now(), 'active', null, 'antaurus', 'andreswsalas', 'antaurustv', '{"instagram": "https://www.instagram.com/andreswsalas", "twitter": "https://x.com/AntaurusTV", "youtube": "https://www.youtube.com/channel/UCJKKGUL0WDwSfry7T_bEdRw", "kick": "https://kick.com/antaurus"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/ivankodcerro", "twitter": "https://x.com/ivankodcerro", "youtube": "https://www.youtube.com/kodgamingtv", "tiktok": "https://www.tiktok.com/@ivankodcerro", "kick": "https://kick.com/kodd"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'kodd'),
    instagram = coalesce(instagram, 'ivankodcerro'),
    twitter = coalesce(twitter, 'ivankodcerro')
  where lower(name) = lower('kodd') or (kick_handle is not null and lower(kick_handle) = 'kodd')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'kodd', 'Male Streamer', true, now(), 'active', null, 'kodd', 'ivankodcerro', 'ivankodcerro', '{"instagram": "https://www.instagram.com/ivankodcerro", "twitter": "https://x.com/ivankodcerro", "youtube": "https://www.youtube.com/kodgamingtv", "tiktok": "https://www.tiktok.com/@ivankodcerro", "kick": "https://kick.com/kodd"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/perre.tv/", "twitter": "https://x.com/perretelevision", "tiktok": "https://www.tiktok.com/@perretv", "kick": "https://kick.com/perretv"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'perretv'),
    instagram = coalesce(instagram, 'perre.tv'),
    twitter = coalesce(twitter, 'perretelevision')
  where lower(name) = lower('PerreTV') or (kick_handle is not null and lower(kick_handle) = 'perretv')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'PerreTV', 'Male Streamer', true, now(), 'active', null, 'perretv', 'perre.tv', 'perretelevision', '{"instagram": "https://www.instagram.com/perre.tv/", "twitter": "https://x.com/perretelevision", "tiktok": "https://www.tiktok.com/@perretv", "kick": "https://kick.com/perretv"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/gloglo_king/", "twitter": "https://x.com/KingGloglo", "youtube": "https://www.youtube.com/@elglogloking", "tiktok": "https://www.tiktok.com/@gloglokingoficial?lang=es", "kick": "https://kick.com/elglogloking"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'elglogloking'),
    instagram = coalesce(instagram, 'gloglo_king'),
    twitter = coalesce(twitter, 'kinggloglo')
  where lower(name) = lower('ElGlogloking') or (kick_handle is not null and lower(kick_handle) = 'elglogloking')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'ElGlogloking', 'Male Streamer', true, now(), 'active', null, 'elglogloking', 'gloglo_king', 'kinggloglo', '{"instagram": "https://www.instagram.com/gloglo_king/", "twitter": "https://x.com/KingGloglo", "youtube": "https://www.youtube.com/@elglogloking", "tiktok": "https://www.tiktok.com/@gloglokingoficial?lang=es", "kick": "https://kick.com/elglogloking"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Male Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/luisormenoa27", "twitter": "https://x.com/luisormenoa27", "tiktok": "https://www.tiktok.com/@luisormenoa27", "kick": "https://kick.com/luisormenoa27"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'luisormenoa27'),
    instagram = coalesce(instagram, 'luisormenoa27'),
    twitter = coalesce(twitter, 'luisormenoa27')
  where lower(name) = lower('Luizormenoa27') or (kick_handle is not null and lower(kick_handle) = 'luisormenoa27')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Luizormenoa27', 'Male Streamer', true, now(), 'active', null, 'luisormenoa27', 'luisormenoa27', 'luisormenoa27', '{"instagram": "https://www.instagram.com/luisormenoa27", "twitter": "https://x.com/luisormenoa27", "tiktok": "https://www.tiktok.com/@luisormenoa27", "kick": "https://kick.com/luisormenoa27"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/itss.amberjayy", "twitter": "https://x.com/amberjayyyyyyyy", "snapchat": "https://snapchat.com/add/itssamberjay"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'itss.amberjayy'),
    twitter = coalesce(twitter, 'amberjayyyyyyyy')
  where lower(name) = lower('Amber Jay')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Amber Jay', 'Female Creator', true, now(), 'active', null, null, 'itss.amberjayy', 'amberjayyyyyyyy', '{"instagram": "https://www.instagram.com/itss.amberjayy", "twitter": "https://x.com/amberjayyyyyyyy", "snapchat": "https://snapchat.com/add/itssamberjay"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/whatisthedeelz", "tiktok": "https://www.tiktok.com/@whatisthedeelz", "twitter": "https://x.com/its_deelz", "facebook": "https://www.facebook.com/whatisthedeelz/"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'whatisthedeelz'),
    twitter = coalesce(twitter, 'its_deelz')
  where lower(name) = lower('Adelia')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Adelia', 'Female Creator', true, now(), 'active', null, null, 'whatisthedeelz', 'its_deelz', '{"instagram": "https://www.instagram.com/whatisthedeelz", "tiktok": "https://www.tiktok.com/@whatisthedeelz", "twitter": "https://x.com/its_deelz", "facebook": "https://www.facebook.com/whatisthedeelz/"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/yourbabehailey", "tiktok": "https://www.tiktok.com/@urbabehailey"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'yourbabehailey'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('Hailey')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Hailey', 'Female Creator', true, now(), 'active', null, null, 'yourbabehailey', null, '{"instagram": "https://www.instagram.com/yourbabehailey", "tiktok": "https://www.tiktok.com/@urbabehailey"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/harrietparkesx", "tiktok": "https://www.tiktok.com/@harrietparkes_x", "youtube": "https://www.youtube.com/@harriet_parkes", "twitter": "https://x.com/harrietparkesx", "snapchat": "https://snapchat.com/t/Qs66VB7m"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'harrietparkesx'),
    twitter = coalesce(twitter, 'harrietparkesx')
  where lower(name) = lower('Harriet Parkes')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Harriet Parkes', 'Female Creator', true, now(), 'active', null, null, 'harrietparkesx', 'harrietparkesx', '{"instagram": "https://www.instagram.com/harrietparkesx", "tiktok": "https://www.tiktok.com/@harrietparkes_x", "youtube": "https://www.youtube.com/@harriet_parkes", "twitter": "https://x.com/harrietparkesx", "snapchat": "https://snapchat.com/t/Qs66VB7m"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/hannahmarblesx", "tiktok": "https://www.tiktok.com/@hannahmarblesx", "twitter": "https://x.com/hannahmarblesxo", "threads": "https://www.threads.com/@hannahmarblesx"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'hannahmarblesx'),
    twitter = coalesce(twitter, 'hannahmarblesxo')
  where lower(name) = lower('Hannah Marbles')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Hannah Marbles', 'Female Creator', true, now(), 'active', null, null, 'hannahmarblesx', 'hannahmarblesxo', '{"instagram": "https://www.instagram.com/hannahmarblesx", "tiktok": "https://www.tiktok.com/@hannahmarblesx", "twitter": "https://x.com/hannahmarblesxo", "threads": "https://www.threads.com/@hannahmarblesx"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/keepchambers", "youtube": "https://youtube.com/channel/UCV8JLbZFHJRf0po6kpPSwjA", "tiktok": "https://www.tiktok.com/@keepchamberss", "twitter": "https://x.com/keepchambers", "threads": "https://www.threads.com/@keepchambers"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'keepchambers'),
    twitter = coalesce(twitter, 'keepchambers')
  where lower(name) = lower('Keep Chambers')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Keep Chambers', 'Female Creator', true, now(), 'active', null, null, 'keepchambers', 'keepchambers', '{"instagram": "https://www.instagram.com/keepchambers", "youtube": "https://youtube.com/channel/UCV8JLbZFHJRf0po6kpPSwjA", "tiktok": "https://www.tiktok.com/@keepchamberss", "twitter": "https://x.com/keepchambers", "threads": "https://www.threads.com/@keepchambers"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/noraxvillalobos", "tiktok": "https://www.tiktok.com/@nora.villalobos", "youtube": "https://m.youtube.com/c/NoraVillalobos", "twitter": "https://x.com/noraxvillalobos", "snapchat": "https://t.snapchat.com/c2YJ8p9k", "threads": "https://www.threads.com/@noraxvillalobos"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'noraxvillalobos'),
    twitter = coalesce(twitter, 'noraxvillalobos')
  where lower(name) = lower('Nora')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Nora', 'Female Creator', true, now(), 'active', null, null, 'noraxvillalobos', 'noraxvillalobos', '{"instagram": "https://www.instagram.com/noraxvillalobos", "tiktok": "https://www.tiktok.com/@nora.villalobos", "youtube": "https://m.youtube.com/c/NoraVillalobos", "twitter": "https://x.com/noraxvillalobos", "snapchat": "https://t.snapchat.com/c2YJ8p9k", "threads": "https://www.threads.com/@noraxvillalobos"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/alexandramarianna", "tiktok": "https://www.tiktok.com/@alexmarianna", "twitter": "https://x.com/aleksandraverse", "threads": "https://www.threads.com/@alexandramarianna"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'alexandramarianna'),
    twitter = coalesce(twitter, 'aleksandraverse')
  where lower(name) = lower('Aleksandra Mariana')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Aleksandra Mariana', 'Female Creator', true, now(), 'active', null, null, 'alexandramarianna', 'aleksandraverse', '{"instagram": "https://www.instagram.com/alexandramarianna", "tiktok": "https://www.tiktok.com/@alexmarianna", "twitter": "https://x.com/aleksandraverse", "threads": "https://www.threads.com/@alexandramarianna"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/ddlouisex", "twitter": "https://x.com/ddlouise2", "threads": "https://www.threads.com/@ddlouisex"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'ddlouisex'),
    twitter = coalesce(twitter, 'ddlouise2')
  where lower(name) = lower('Ddlouise')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Ddlouise', 'Female Creator', true, now(), 'active', null, null, 'ddlouisex', 'ddlouise2', '{"instagram": "https://www.instagram.com/ddlouisex", "twitter": "https://x.com/ddlouise2", "threads": "https://www.threads.com/@ddlouisex"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/callme.k.melons", "twitter": "https://x.com/callme_k_melons", "facebook": "https://www.facebook.com/people/Makayla-Melons/61573212441807/", "snapchat": "https://www.snapchat.com/@makayla.melons", "threads": "https://www.threads.com/@callme.k.melons"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'callme.k.melons'),
    twitter = coalesce(twitter, 'callme_k_melons')
  where lower(name) = lower('Call Me Melons')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Call Me Melons', 'Female Creator', true, now(), 'active', null, null, 'callme.k.melons', 'callme_k_melons', '{"instagram": "https://www.instagram.com/callme.k.melons", "twitter": "https://x.com/callme_k_melons", "facebook": "https://www.facebook.com/people/Makayla-Melons/61573212441807/", "snapchat": "https://www.snapchat.com/@makayla.melons", "threads": "https://www.threads.com/@callme.k.melons"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/niahxoxo8", "twitter": "https://x.com/niahxoxo8", "threads": "https://www.threads.com/@niahxoxo8"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'niahxoxo8'),
    twitter = coalesce(twitter, 'niahxoxo8')
  where lower(name) = lower('Niah')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Niah', 'Female Creator', true, now(), 'active', null, null, 'niahxoxo8', 'niahxoxo8', '{"instagram": "https://www.instagram.com/niahxoxo8", "twitter": "https://x.com/niahxoxo8", "threads": "https://www.threads.com/@niahxoxo8"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/sweetbunnyisback", "youtube": "https://www.youtube.com/channel/UCNtUUzHP0CzLSpkKQl1a1pw", "tiktok": "https://www.tiktok.com/@realsweetbunny", "twitter": "https://x.com/sweet_bunnyxxx", "threads": "https://www.threads.com/@sweetbunnyisback"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'sweetbunnyisback'),
    twitter = coalesce(twitter, 'sweet_bunnyxxx')
  where lower(name) = lower('Lauren')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Lauren', 'Female Creator', true, now(), 'active', null, null, 'sweetbunnyisback', 'sweet_bunnyxxx', '{"instagram": "https://www.instagram.com/sweetbunnyisback", "youtube": "https://www.youtube.com/channel/UCNtUUzHP0CzLSpkKQl1a1pw", "tiktok": "https://www.tiktok.com/@realsweetbunny", "twitter": "https://x.com/sweet_bunnyxxx", "threads": "https://www.threads.com/@sweetbunnyisback"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/_sarahillustrates", "tiktok": "https://tiktok.com/@sarahillustrates", "twitter": "https://x.com/sarahsworldx3", "threads": "https://www.threads.com/@_sarahillustrates"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, '_sarahillustrates'),
    twitter = coalesce(twitter, 'sarahsworldx3')
  where lower(name) = lower('Sarah''s World')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Sarah''s World', 'Female Creator', true, now(), 'active', null, null, '_sarahillustrates', 'sarahsworldx3', '{"instagram": "https://www.instagram.com/_sarahillustrates", "tiktok": "https://tiktok.com/@sarahillustrates", "twitter": "https://x.com/sarahsworldx3", "threads": "https://www.threads.com/@_sarahillustrates"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/jamelizsmth", "tiktok": "https://www.tiktok.com/@jamelizxo", "twitter": "https://x.com/jamelizbsmth", "snapchat": "https://www.snapchat.com/@jamelizsmth"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'jamelizsmth'),
    twitter = coalesce(twitter, 'jamelizbsmth')
  where lower(name) = lower('Jameliz (Jellybean)')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Jameliz (Jellybean)', 'Female Creator', true, now(), 'active', null, null, 'jamelizsmth', 'jamelizbsmth', '{"instagram": "https://www.instagram.com/jamelizsmth", "tiktok": "https://www.tiktok.com/@jamelizxo", "twitter": "https://x.com/jamelizbsmth", "snapchat": "https://www.snapchat.com/@jamelizsmth"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Creator',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/kazumisworld", "twitter": "https://x.com/Kazumisworld", "snapchat": "https://www.snapchat.com/@kazumisverse", "threads": "https://www.threads.com/@kazumisworld"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'kazumisworld'),
    twitter = coalesce(twitter, 'kazumisworld')
  where lower(name) = lower('Kazumi')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Kazumi', 'Female Creator', true, now(), 'active', null, null, 'kazumisworld', 'kazumisworld', '{"instagram": "https://www.instagram.com/kazumisworld", "twitter": "https://x.com/Kazumisworld", "snapchat": "https://www.snapchat.com/@kazumisverse", "threads": "https://www.threads.com/@kazumisworld"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/charlparkesx", "kick": "https://kick.com/CharlotteParkes", "instagram": "https://www.instagram.com/charlparkesx", "youtube": "https://www.youtube.com/@charlparkesx", "tiktok": "https://www.tiktok.com/@charlparkesx", "twitter": "https://x.com/charllparkes", "snapchat": "https://snapchat.com/t/mSVMAqoH", "threads": "https://www.threads.com/@charlparkesx"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'charlparkesx'),
    kick_handle = coalesce(kick_handle, 'charlotteparkes'),
    instagram = coalesce(instagram, 'charlparkesx'),
    twitter = coalesce(twitter, 'charllparkes')
  where lower(name) = lower('Charlotte Parkes') or (twitch_handle is not null and lower(twitch_handle) = 'charlparkesx') or (kick_handle is not null and lower(kick_handle) = 'charlotteparkes')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Charlotte Parkes', 'Female Streamer', true, now(), 'active', 'charlparkesx', 'charlotteparkes', 'charlparkesx', 'charllparkes', '{"twitch": "https://twitch.tv/charlparkesx", "kick": "https://kick.com/CharlotteParkes", "instagram": "https://www.instagram.com/charlparkesx", "youtube": "https://www.youtube.com/@charlparkesx", "tiktok": "https://www.tiktok.com/@charlparkesx", "twitter": "https://x.com/charllparkes", "snapchat": "https://snapchat.com/t/mSVMAqoH", "threads": "https://www.threads.com/@charlparkesx"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/azra", "instagram": "https://www.instagram.com/azra_lifts", "youtube": "https://www.youtube.com/@AzraLiftsVlogs", "tiktok": "https://www.tiktok.com/@Goodgirlazra", "twitter": "https://x.com/azra_lifts", "snapchat": "https://www.snapchat.com/add/Azra_lift"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'azra'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'azra_lifts'),
    twitter = coalesce(twitter, 'azra_lifts')
  where lower(name) = lower('Azra') or (twitch_handle is not null and lower(twitch_handle) = 'azra')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Azra', 'Female Streamer', true, now(), 'active', 'azra', null, 'azra_lifts', 'azra_lifts', '{"twitch": "https://twitch.tv/azra", "instagram": "https://www.instagram.com/azra_lifts", "youtube": "https://www.youtube.com/@AzraLiftsVlogs", "tiktok": "https://www.tiktok.com/@Goodgirlazra", "twitter": "https://x.com/azra_lifts", "snapchat": "https://www.snapchat.com/add/Azra_lift"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/bellaramatv", "instagram": "https://www.instagram.com/bellaramatv", "tiktok": "https://www.tiktok.com/@bellaramatv", "twitter": "https://x.com/bellaramatv", "snapchat": "https://www.snapchat.com/add/bella.ramatv"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'bellaramatv'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'bellaramatv'),
    twitter = coalesce(twitter, 'bellaramatv')
  where lower(name) = lower('Bella Rama') or (twitch_handle is not null and lower(twitch_handle) = 'bellaramatv')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Bella Rama', 'Female Streamer', true, now(), 'active', 'bellaramatv', null, 'bellaramatv', 'bellaramatv', '{"twitch": "https://twitch.tv/bellaramatv", "instagram": "https://www.instagram.com/bellaramatv", "tiktok": "https://www.tiktok.com/@bellaramatv", "twitter": "https://x.com/bellaramatv", "snapchat": "https://www.snapchat.com/add/bella.ramatv"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/kjanecaron", "kick": "https://kick.com/kjanecaron", "instagram": "https://www.instagram.com/kjanecaron", "youtube": "https://youtube.com/channel/UCu50PkFZIpy72FP4ysCZd_Q", "tiktok": "https://tiktok.com/@kjanecaronn", "twitter": "https://x.com/kjanecaron", "snapchat": "https://www.snapchat.com/add/kjanecaron", "facebook": "https://facebook.com/itskjanecaron"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'kjanecaron'),
    kick_handle = coalesce(kick_handle, 'kjanecaron'),
    instagram = coalesce(instagram, 'kjanecaron'),
    twitter = coalesce(twitter, 'kjanecaron')
  where lower(name) = lower('K Jane Caron (KJ)') or (twitch_handle is not null and lower(twitch_handle) = 'kjanecaron') or (kick_handle is not null and lower(kick_handle) = 'kjanecaron')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'K Jane Caron (KJ)', 'Female Streamer', true, now(), 'active', 'kjanecaron', 'kjanecaron', 'kjanecaron', 'kjanecaron', '{"twitch": "https://twitch.tv/kjanecaron", "kick": "https://kick.com/kjanecaron", "instagram": "https://www.instagram.com/kjanecaron", "youtube": "https://youtube.com/channel/UCu50PkFZIpy72FP4ysCZd_Q", "tiktok": "https://tiktok.com/@kjanecaronn", "twitter": "https://x.com/kjanecaron", "snapchat": "https://www.snapchat.com/add/kjanecaron", "facebook": "https://facebook.com/itskjanecaron"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://twitch.tv/ellievandeel", "instagram": "https://www.instagram.com/ellievandeel", "youtube": "https://www.youtube.com/@ellievandeell", "tiktok": "https://www.tiktok.com/@ellievandeel", "twitter": "https://x.com/ellievandeel", "snapchat": "https://snapchat.com/t/ptn2MICD"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'ellievandeel'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'ellievandeel'),
    twitter = coalesce(twitter, 'ellievandeel')
  where lower(name) = lower('Ellie Vandeel') or (twitch_handle is not null and lower(twitch_handle) = 'ellievandeel')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Ellie Vandeel', 'Female Streamer', true, now(), 'active', 'ellievandeel', null, 'ellievandeel', 'ellievandeel', '{"twitch": "https://twitch.tv/ellievandeel", "instagram": "https://www.instagram.com/ellievandeel", "youtube": "https://www.youtube.com/@ellievandeell", "tiktok": "https://www.tiktok.com/@ellievandeel", "twitter": "https://x.com/ellievandeel", "snapchat": "https://snapchat.com/t/ptn2MICD"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://m.twitch.tv/xoaeriel/home", "instagram": "https://www.instagram.com/xoaeriel", "youtube": "https://www.youtube.com/@xoaeriel", "tiktok": "https://www.tiktok.com/@aerielxo", "twitter": "https://x.com/xoaeriel", "threads": "https://www.threads.com/@xoaeriel"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'home'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'xoaeriel'),
    twitter = coalesce(twitter, 'xoaeriel')
  where lower(name) = lower('Ariel') or (twitch_handle is not null and lower(twitch_handle) = 'home')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Ariel', 'Female Streamer', true, now(), 'active', 'home', null, 'xoaeriel', 'xoaeriel', '{"twitch": "https://m.twitch.tv/xoaeriel/home", "instagram": "https://www.instagram.com/xoaeriel", "youtube": "https://www.youtube.com/@xoaeriel", "tiktok": "https://www.tiktok.com/@aerielxo", "twitter": "https://x.com/xoaeriel", "threads": "https://www.threads.com/@xoaeriel"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"twitch": "https://www.twitch.tv/amberexclusive", "instagram": "https://www.instagram.com/amber.exclusive", "twitter": "https://x.com/amberexclusive", "threads": "https://www.threads.com/@amber.exclusive"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, 'amberexclusive'),
    kick_handle = coalesce(kick_handle, null),
    instagram = coalesce(instagram, 'amber.exclusive'),
    twitter = coalesce(twitter, 'amberexclusive')
  where lower(name) = lower('Amber Exclusive') or (twitch_handle is not null and lower(twitch_handle) = 'amberexclusive')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Amber Exclusive', 'Female Streamer', true, now(), 'active', 'amberexclusive', null, 'amber.exclusive', 'amberexclusive', '{"twitch": "https://www.twitch.tv/amberexclusive", "instagram": "https://www.instagram.com/amber.exclusive", "twitter": "https://x.com/amberexclusive", "threads": "https://www.threads.com/@amber.exclusive"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/milenkanolasco", "tiktok": "https://www.tiktok.com/@milenka.nolasco_", "kick": "https://kick.com/milenkanolasco"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'milenkanolasco'),
    instagram = coalesce(instagram, 'milenkanolasco'),
    twitter = coalesce(twitter, null)
  where lower(name) = lower('milenkanolasco') or (kick_handle is not null and lower(kick_handle) = 'milenkanolasco')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'milenkanolasco', 'Female Streamer', true, now(), 'active', null, 'milenkanolasco', 'milenkanolasco', null, '{"instagram": "https://www.instagram.com/milenkanolasco", "tiktok": "https://www.tiktok.com/@milenka.nolasco_", "kick": "https://kick.com/milenkanolasco"}'::jsonb
where not exists (select 1 from upd);

with upd as (
  update creators set
    category = 'Female Streamer',
    signed = true,
    signed_at = coalesce(signed_at, now()),
    socials = coalesce(socials, '{}'::jsonb) || '{"instagram": "https://www.instagram.com/Emikukiss", "twitter": "https://x.com/Emikukis", "tiktok": "https://www.tiktok.com/@Emikukisvt", "kick": "https://kick.com/emikukis"}'::jsonb,
    twitch_handle = coalesce(twitch_handle, null),
    kick_handle = coalesce(kick_handle, 'emikukis'),
    instagram = coalesce(instagram, 'emikukiss'),
    twitter = coalesce(twitter, 'emikukis')
  where lower(name) = lower('Emikukis') or (kick_handle is not null and lower(kick_handle) = 'emikukis')
  returning id
)
insert into creators (name, category, signed, signed_at, status, twitch_handle, kick_handle, instagram, twitter, socials)
select 'Emikukis', 'Female Streamer', true, now(), 'active', null, 'emikukis', 'emikukiss', 'emikukis', '{"instagram": "https://www.instagram.com/Emikukiss", "twitter": "https://x.com/Emikukis", "tiktok": "https://www.tiktok.com/@Emikukisvt", "kick": "https://kick.com/emikukis"}'::jsonb
where not exists (select 1 from upd);
