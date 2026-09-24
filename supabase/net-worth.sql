-- Run in Supabase SQL Editor before publishing this version.
-- Existing preferences and transactions are preserved.
begin;
alter table public.user_settings
  add column if not exists net_worth jsonb
  check (net_worth is null or (
    jsonb_typeof(net_worth) = 'object'
    and net_worth ?& array['currency','assets','liabilities']
    and net_worth->>'currency' in ('RON','EUR','USD')
    and jsonb_typeof(net_worth->'assets') = 'array'
    and jsonb_typeof(net_worth->'liabilities') = 'array'
  ));
commit;
