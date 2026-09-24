-- Run once in the Supabase SQL Editor before configuring the app.
begin;
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'RON' check (currency in ('RON', 'EUR', 'USD')),
  daily_allowance double precision not null default 100
    check (daily_allowance >= 0 and daily_allowance < 'Infinity'::double precision),
  daily_currency text not null default 'RON' check (daily_currency in ('RON', 'EUR', 'USD')),
  baseline_burn double precision not null default 15000
    check (baseline_burn >= 0 and baseline_burn < 'Infinity'::double precision),
  horizon integer not null default 12 check (horizon in (6, 12, 24, 36))
);

alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;

create policy "Read own settings" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own settings" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own settings" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
commit;
