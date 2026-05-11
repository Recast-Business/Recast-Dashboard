-- Phase G — STEP 1 of 2.
--
-- Adds 'operator' to the user_role enum.
-- Postgres requires the new enum value to be committed before it can be
-- referenced in queries (see error 55P04). So this file does ONE thing only;
-- run it on its own in Supabase SQL Editor, then run 0023_operator_policies.sql
-- to add the column + RLS policies.

alter type user_role add value if not exists 'operator';
