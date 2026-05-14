-- 0044_drop_agreement_links.sql
-- R5 Sweep 3d: finish what 0043 started — drop creators.agreement_links
-- now that the dashboard reads agreements exclusively from the new
-- creator_agreements table.
--
-- Two-step:
--   1. Remediate a backfill miss in 0043 (overlay → efuse rename
--      drift) so any stragglers in the JSON map make it across.
--   2. Drop the column.
--
-- IDEMPOTENT — safe to re-run.

-- ============================================================
-- 1. Backfill remediation
-- ============================================================
-- Sweep 3a's 0043 backfill filter accepted only the commission-platform
-- slugs ('onlyfans', 'telegram', 'efuse', 'deal', 'other'). But the
-- pre-3a CreatorProfileDialog wrote the SLOT slug 'overlay' (display
-- key) into agreement_links, not the commission slug 'efuse'. Result:
-- any 'overlay' entry in agreement_links was silently skipped by 0043.
-- Same data, different slug — fix it before the column disappears.
--
-- Maps 'overlay' → 'efuse' so the new row joins the rest of the
-- Ad Overlay agreements. Idempotent: skips inserts where a row for
-- (creator, efuse, main, url) already exists.

insert into creator_agreements (creator_id, platform, page_name, label, url)
select
  c.id,
  'efuse',
  'main',
  'Agreement',
  trim(both '"' from agr.value::text)
from creators c,
     jsonb_each(c.agreement_links) as agr(key, value)
where c.agreement_links is not null
  and c.agreement_links <> '{}'::jsonb
  and agr.key = 'overlay'
  and agr.value is not null
  and jsonb_typeof(agr.value) = 'string'
  and (agr.value::text <> '""' and trim(both '"' from agr.value::text) <> '')
  and not exists (
    select 1 from creator_agreements ea
    where ea.creator_id = c.id
      and ea.platform = 'efuse'
      and ea.page_name = 'main'
      and ea.url = trim(both '"' from agr.value::text)
  );

-- ============================================================
-- 2. Drop the column
-- ============================================================
-- Once dropped, the dashboard has zero references to agreement_links
-- (verified in TalentLedger + CreatorProfileDialog + useCreators by
-- the time this migration runs).

alter table creators drop column if exists agreement_links;
