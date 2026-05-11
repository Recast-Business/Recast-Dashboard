-- 0001_auth_profiles.sql
-- Role enum + profiles table (1:1 with auth.users).

do $$ begin
  create type user_role as enum ('admin', 'partner', 'finance');
exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null default 'partner',
  created_at timestamptz not null default now()
);

comment on table profiles is 'Application-level user profile; role drives RBAC + RLS.';

-- Automatically create a profile row when a new auth user is created.
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
