-- GuestMirror initial schema
-- Run via `supabase db push` or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- profiles: mirrors auth.users, created lazily when a user signs in
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  listing_url text,
  city text,
  property_type text,
  guest_capacity text,
  nightly_price text,
  overall_score integer not null,
  result_json jsonb not null,
  is_unlocked boolean not null default false,
  payment_status text not null default 'none' check (payment_status in ('none', 'pending', 'paid')),
  previous_analysis_id uuid references public.analyses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analyses_user_id_idx on public.analyses (user_id);
create index if not exists analyses_previous_analysis_id_idx on public.analyses (previous_analysis_id);

create table if not exists public.analysis_images (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  storage_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists analysis_images_analysis_id_idx on public.analysis_images (analysis_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  analysis_id uuid references public.analyses (id) on delete set null,
  stripe_session_id text,
  stripe_payment_intent_id text,
  amount integer,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists payments_analysis_id_idx on public.payments (analysis_id);

-- Row Level Security: all reads/writes go through the server using the
-- Supabase service-role key, which bypasses RLS entirely. We enable RLS
-- with no public policies so anon/authenticated clients get zero direct
-- access to this data.
alter table public.profiles enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_images enable row level security;
alter table public.payments enable row level security;

-- Keep `updated_at` fresh on analyses.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists analyses_set_updated_at on public.analyses;
create trigger analyses_set_updated_at
  before update on public.analyses
  for each row execute function public.set_updated_at();

-- Storage bucket for uploaded listing screenshots (private).
insert into storage.buckets (id, name, public)
values ('listing-screenshots', 'listing-screenshots', false)
on conflict (id) do nothing;
