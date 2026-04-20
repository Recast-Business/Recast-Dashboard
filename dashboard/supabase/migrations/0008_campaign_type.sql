-- 0008_campaign_type.sql
-- Free-text category on campaigns (e.g. "Partnership", "Ad Overlay", "One-off").

alter table campaigns add column if not exists type text;

create index if not exists campaigns_type_idx on campaigns(type);
