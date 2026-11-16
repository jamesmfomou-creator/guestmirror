-- Pricing v2 (2026-11): Analyse unique 7,90 €, Conciergerie 34,90 €/mois
-- (20 analyses per paid month), Accès à vie 89 € (unlimited).
--
-- NON-DESTRUCTIVE: only new tables, new nullable columns, indexes and one
-- function. Nothing existing is altered, renamed or dropped. Legacy rights
-- (public.subscriptions: GuestMirror Plus 6,90 €/mois, legacy lifetime) and
-- every analysis already unlocked are left exactly as they are; the
-- application keeps reading them.
--
-- Rollback: the application stops using these objects if the code is
-- reverted; they can then be left in place (harmless) or dropped with
--   drop function if exists public.consume_grant_credit(uuid, uuid);
--   drop table if exists public.credit_usages, public.access_grants,
--     public.stripe_events, public.email_verifications, public.access_sessions;
--   alter table public.payments drop column if exists plan, ...;
-- (only after confirming no new-offer customer exists).

-- ---------------------------------------------------------------------------
-- Stripe event journal: one row per event id. Makes webhook handling
-- idempotent (a redelivered event is recognised and skipped) and keeps a
-- history of what Stripe told us.
create table if not exists public.stripe_events (
  id text primary key,                 -- Stripe event id (evt_...)
  type text not null,
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,            -- null while processing / if it failed
  outcome text                         -- short machine string, never personal data
);
create index if not exists stripe_events_type_idx on public.stripe_events (type);
alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------------------
-- Rights bought with the v2 offers that outlive a single report:
--   conciergerie  monthly subscription, quota_per_period analyses per PAID
--                 period (paid_period_start..paid_period_end, set only by a
--                 paid invoice -- a failed renewal never opens a new period)
--   lifetime      one-time purchase, unlimited, until refunded/disputed
-- Several rows per email are allowed (e.g. a legacy Plus subscriber who also
-- buys lifetime), unlike public.subscriptions.
create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  kind text not null check (kind in ('conciergerie', 'lifetime')),
  status text not null
    check (status in ('incomplete', 'active', 'trialing', 'past_due', 'unpaid', 'canceled', 'revoked', 'suspended')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_price_id text,
  quota_per_period integer,            -- null = unlimited
  paid_period_start timestamptz,
  paid_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Report to unlock with the first credit once the first period is paid
  -- (the analysis the visitor subscribed from).
  pending_unlock_analysis_id uuid references public.analyses (id) on delete set null,
  -- Stripe "created" time of the last event applied to status, so an event
  -- delivered late never overwrites a newer state.
  status_event_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists access_grants_email_idx on public.access_grants (email);
create unique index if not exists access_grants_subscription_unique_idx
  on public.access_grants (stripe_subscription_id) where stripe_subscription_id is not null;
create unique index if not exists access_grants_checkout_session_unique_idx
  on public.access_grants (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
alter table public.access_grants enable row level security;
drop trigger if exists access_grants_set_updated_at on public.access_grants;
create trigger access_grants_set_updated_at
  before update on public.access_grants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- One row per report unlocked with a Conciergerie credit. unique(analysis_id):
-- a report can never cost two credits, whatever the retries.
create table if not exists public.credit_usages (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.access_grants (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  period_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique (analysis_id)
);
create index if not exists credit_usages_grant_period_idx on public.credit_usages (grant_id, period_start);
alter table public.credit_usages enable row level security;

-- Atomic "use one Conciergerie analysis on this report". The grant row is
-- locked for the duration, so two simultaneous requests can never both pass
-- the quota check. Idempotent: a report already unlocked with a credit
-- returns 'already' and costs nothing. Returns the outcome and the usage of
-- the current paid period.
create or replace function public.consume_grant_credit(p_grant_id uuid, p_analysis_id uuid)
returns table (outcome text, used integer, quota integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.access_grants%rowtype;
  n integer;
begin
  select * into g from public.access_grants where id = p_grant_id for update;
  if not found then
    return query select 'no_grant'::text, 0, 0;
    return;
  end if;

  if exists (select 1 from public.credit_usages where analysis_id = p_analysis_id) then
    select count(*) into n from public.credit_usages
      where grant_id = g.id and period_start = g.paid_period_start;
    return query select 'already'::text, n, coalesce(g.quota_per_period, 0);
    return;
  end if;

  if g.kind <> 'conciergerie'
     or g.status not in ('active', 'trialing')
     or g.paid_period_start is null
     or g.paid_period_end is null
     or g.paid_period_end <= now() then
    return query select 'inactive'::text, 0, coalesce(g.quota_per_period, 0);
    return;
  end if;

  select count(*) into n from public.credit_usages
    where grant_id = g.id and period_start = g.paid_period_start;
  if n >= g.quota_per_period then
    return query select 'quota_exhausted'::text, n, g.quota_per_period;
    return;
  end if;

  insert into public.credit_usages (grant_id, analysis_id, period_start)
    values (g.id, p_analysis_id, g.paid_period_start);
  update public.analyses
    set is_unlocked = true, payment_status = 'paid'
    where id = p_analysis_id;
  return query select 'consumed'::text, n + 1, g.quota_per_period;
end;
$$;
revoke all on function public.consume_grant_credit(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email ownership proof. Rights are tied to an email (there are no accounts),
-- so using a subscription or lifetime right first requires proving the
-- visitor reads that mailbox: a 6-digit code (stored hashed, short-lived,
-- few attempts), then an opaque session cookie (stored hashed).
create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_verifications_email_idx on public.email_verifications (email, created_at desc);
alter table public.email_verifications enable row level security;

-- scope_checkout_session_id: a session opened on the return from Stripe
-- Checkout (no code typed) only grants the rights bought in THAT checkout.
-- Paying with someone else's email must never reveal their other rights;
-- only the emailed code (scope null) proves ownership of the whole email.
create table if not exists public.access_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  scope_checkout_session_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists access_sessions_email_idx on public.access_sessions (email);
alter table public.access_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Payments history: which offer and price, and what happened afterwards.
alter table public.payments add column if not exists plan text;
alter table public.payments add column if not exists stripe_price_id text;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists disputed_at timestamptz;
create index if not exists payments_payment_intent_idx
  on public.payments (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
