-- Run once in Supabase SQL Editor BEFORE publishing the updated app.
-- Existing user_settings and saved preferences are left intact.
begin;
create table public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (
    jsonb_typeof(state) = 'object'
    and state ?& array['transactions', 'scenario', 'chart', 'view', 'draft']
    and jsonb_typeof(state->'transactions') = 'array'
    and jsonb_typeof(state->'scenario') = 'object'
    and jsonb_typeof(state->'draft') = 'object'
  ),
  revision integer not null check (revision > 0)
);
alter table public.user_app_state enable row level security;
alter table public.user_app_state force row level security;
revoke all on public.user_app_state from anon, authenticated;
grant select, insert, update on public.user_app_state to authenticated;
create policy "Read own app data" on public.user_app_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own app data" on public.user_app_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own app data" on public.user_app_state
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
commit;
