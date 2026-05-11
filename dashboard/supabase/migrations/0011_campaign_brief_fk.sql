-- 0011_campaign_brief_fk.sql
-- Add the missing foreign key from campaigns.brief_id → briefs.id so that
-- PostgREST can embed the brief relation on campaign queries. Also ensures
-- deleting a brief leaves the campaign intact (FK set to null).

do $$ begin
  alter table campaigns
    add constraint campaigns_brief_id_fkey
      foreign key (brief_id) references briefs(id) on delete set null;
exception when duplicate_object then null;
end $$;
