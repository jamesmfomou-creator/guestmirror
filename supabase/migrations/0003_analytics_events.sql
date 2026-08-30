-- GuestMirror funnel analytics: a single append-only events table.
-- Existing tables (analyses, analysis_images, payments, profiles) are left
-- untouched -- this migration only adds tracking, it does not duplicate
-- data those tables already hold (score, payment amount, etc.).

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  anonymous_id text,
  user_id uuid references auth.users (id) on delete set null,
  analysis_id uuid references public.analyses (id) on delete set null,
  email text,
  session_id text,
  source text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at);
create index if not exists analytics_events_anonymous_id_idx on public.analytics_events (anonymous_id);
create index if not exists analytics_events_session_id_idx on public.analytics_events (session_id);
create index if not exists analytics_events_analysis_id_idx on public.analytics_events (analysis_id);
create index if not exists analytics_events_source_idx on public.analytics_events (source);

-- Row Level Security: same pattern as every other table in this project --
-- all reads/writes go through the server using the Supabase service-role
-- key (POST /api/track for inserts, the Stripe webhook for
-- payment_completed, /admin/analytics for reads). RLS is enabled with NO
-- public policies, so anon/authenticated clients get zero direct access:
-- events cannot be read, listed, updated, or deleted from the browser, and
-- cannot be inserted from the browser either (only via the server route,
-- which validates the event name server-side).
alter table public.analytics_events enable row level security;
