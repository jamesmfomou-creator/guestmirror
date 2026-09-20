-- Reusable "free trial" links: /analyze?promo=<code> grants the first
-- max_free_unlocks analyses submitted with that code a real, full unlock
-- (no payment), with no other change to scoring/Stripe/pricing. Once a
-- code's quota is used up, further submissions with it behave exactly
-- like a normal analysis -- the existing paywall (including Lifetime)
-- applies as-is, nothing new needed there.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  max_free_unlocks integer not null default 3,
  created_at timestamptz not null default now()
);

alter table public.analyses
  add column if not exists promo_code text references public.promo_codes (code) on delete set null;

create index if not exists analyses_promo_code_idx on public.analyses (promo_code);

-- Same RLS pattern as every other table: service-role only, no public policies.
alter table public.promo_codes enable row level security;
