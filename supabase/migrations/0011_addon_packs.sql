-- Add-on "Pack 10 analyses supplémentaires" (12,90 €, one-time) for
-- Conciergerie subscribers: bought with the first subscription payment
-- (order bump) or later from the report page.
--
-- NON-DESTRUCTIVE: one new table, one new nullable column, indexes and one
-- new function. consume_grant_credit (0010) is left exactly as it is; the
-- application switches to consume_analysis_credit below.
--
-- Rules:
--  - A pack holds `credits` analyses that never expire and are not reset by
--    the monthly renewal. They stay usable after the subscription ends
--    (bought and paid for), as long as the pack is active.
--  - The monthly quota is always used first, then the oldest active pack.
--  - A refunded pack is revoked (its unused credits are withdrawn; reports
--    already unlocked stay unlocked); a disputed pack is suspended until the
--    dispute is won.
--
-- Rollback (only after confirming no pack was sold):
--   drop function if exists public.consume_analysis_credit(uuid, uuid);
--   alter table public.credit_usages drop column if exists pack_id;
--   drop table if exists public.credit_packs;

create table if not exists public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  grant_id uuid references public.access_grants (id) on delete set null,
  source text not null check (source in ('subscription_checkout', 'account')),
  credits integer not null check (credits > 0),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  amount integer,                        -- cents actually charged for the pack
  stripe_price_id text,
  stripe_checkout_session_id text,       -- account purchases (mode=payment)
  stripe_invoice_id text,                -- order bump (first subscription invoice)
  stripe_payment_intent_id text,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credit_packs_email_idx on public.credit_packs (email, created_at);
create index if not exists credit_packs_payment_intent_idx
  on public.credit_packs (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
-- One pack per payment, whatever the webhook redeliveries.
create unique index if not exists credit_packs_invoice_unique_idx
  on public.credit_packs (stripe_invoice_id) where stripe_invoice_id is not null;
create unique index if not exists credit_packs_checkout_session_unique_idx
  on public.credit_packs (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
alter table public.credit_packs enable row level security;
drop trigger if exists credit_packs_set_updated_at on public.credit_packs;
create trigger credit_packs_set_updated_at
  before update on public.credit_packs
  for each row execute function public.set_updated_at();

-- null = the report used a monthly Conciergerie analysis (as before).
alter table public.credit_usages add column if not exists pack_id uuid references public.credit_packs (id) on delete set null;
create index if not exists credit_usages_pack_idx on public.credit_usages (pack_id) where pack_id is not null;

-- Atomic "use one analysis on this report": the monthly quota first, then the
-- oldest active pack of the same email. The grant row is locked for the
-- duration (every consumption of an email goes through its grant), so
-- simultaneous requests can never overspend. Idempotent per report.
create or replace function public.consume_analysis_credit(p_grant_id uuid, p_analysis_id uuid)
returns table (outcome text, source text, used integer, quota integer, extra_remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.access_grants%rowtype;
  n integer;
  in_period boolean;
  p_id uuid;
  extra integer;
begin
  select * into g from public.access_grants where id = p_grant_id for update;
  if not found then
    return query select 'no_grant'::text, null::text, 0, 0, 0;
    return;
  end if;

  in_period := g.kind = 'conciergerie'
    and g.status in ('active', 'trialing')
    and g.paid_period_start is not null
    and g.paid_period_end is not null
    and g.paid_period_end > now();

  n := 0;
  if g.paid_period_start is not null then
    select count(*) into n from public.credit_usages
      where grant_id = g.id and period_start = g.paid_period_start and pack_id is null;
  end if;

  if exists (select 1 from public.credit_usages where analysis_id = p_analysis_id) then
    select coalesce(sum(cp.credits - (select count(*) from public.credit_usages cu where cu.pack_id = cp.id)), 0)::integer
      into extra from public.credit_packs cp where cp.email = g.email and cp.status = 'active';
    return query select 'already'::text, null::text, case when in_period then n else 0 end,
      case when in_period then coalesce(g.quota_per_period, 0) else 0 end, extra;
    return;
  end if;

  if in_period and n < g.quota_per_period then
    insert into public.credit_usages (grant_id, analysis_id, period_start)
      values (g.id, p_analysis_id, g.paid_period_start);
    update public.analyses set is_unlocked = true, payment_status = 'paid' where id = p_analysis_id;
    select coalesce(sum(cp.credits - (select count(*) from public.credit_usages cu where cu.pack_id = cp.id)), 0)::integer
      into extra from public.credit_packs cp where cp.email = g.email and cp.status = 'active';
    return query select 'consumed'::text, 'monthly'::text, n + 1, g.quota_per_period, extra;
    return;
  end if;

  -- Oldest active pack with credits left.
  select cp.id into p_id from public.credit_packs cp
    where cp.email = g.email and cp.status = 'active'
      and cp.credits > (select count(*) from public.credit_usages cu where cu.pack_id = cp.id)
    order by cp.created_at
    limit 1
    for update;
  if p_id is not null then
    insert into public.credit_usages (grant_id, analysis_id, period_start, pack_id)
      values (g.id, p_analysis_id, coalesce(g.paid_period_start, now()), p_id);
    update public.analyses set is_unlocked = true, payment_status = 'paid' where id = p_analysis_id;
    select coalesce(sum(cp.credits - (select count(*) from public.credit_usages cu where cu.pack_id = cp.id)), 0)::integer
      into extra from public.credit_packs cp where cp.email = g.email and cp.status = 'active';
    -- Outside a paid period there is no monthly quota to report.
    return query select 'consumed'::text, 'pack'::text, case when in_period then n else 0 end,
      case when in_period then coalesce(g.quota_per_period, 0) else 0 end, extra;
    return;
  end if;

  if in_period then
    return query select 'quota_exhausted'::text, null::text, n, g.quota_per_period, 0;
  else
    return query select 'inactive'::text, null::text, 0, coalesce(g.quota_per_period, 0), 0;
  end if;
end;
$$;
revoke all on function public.consume_analysis_credit(uuid, uuid) from public, anon, authenticated;
