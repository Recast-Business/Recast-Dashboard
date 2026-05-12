-- 0041_drop_vendor_service_provided.sql
-- Round 5 Sweep 1 (Gustavo, T2): drop vendors.service_provided.
--
-- Originally added in 0034 (R3B) at Gustavo's request as a short
-- description of what the vendor does for Recast. Three weeks later
-- Gustavo reversed the ask: "this is going to be listed on the
-- invoice... we don't need we can remove the service provider".
--
-- The data in the column (if any) is lost. Application code paths
-- that read service_provided are removed in the same Sweep 1 commit.
-- Defensive drop with IF EXISTS for re-run safety.

alter table vendors
  drop column if exists service_provided;
