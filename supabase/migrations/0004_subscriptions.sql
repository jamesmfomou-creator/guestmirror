-- GuestMirror Plus: subscription entitlement, keyed by email since the
-- app has no auth/user-account system (profiles/auth.users are unused --
-- see 0001_init.sql). One row per subscriber; status is always synced
-- from Stripe webhooks, never inferred client-side.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  subscription_status text not null default 'none'
    check (subscription_status in ('none', 'incomplete', 'active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  subscription_plan text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_email_idx on public.subscriptions (email);
create index if not exists subscriptions_stripe_subscription_id_idx on public.subscriptions (stripe_subscription_id);
create index if not exists subscriptions_status_idx on public.subscriptions (subscription_status);

-- Same RLS pattern as every other table: service-role only, no public policies.
alter table public.subscriptions enable row level security;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();
