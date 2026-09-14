-- User profile capture (collected once per analysis, right after
-- input/URL submission -- see AnalyzeWizard's "profile" step) and
-- post-purchase feedback/testimonial collection.
--
-- No new access-state table: GuestMirror Lifetime reuses public.subscriptions
-- (subscription_plan = 'lifetime', subscription_status = 'active',
-- current_period_end left null) -- subscription_plan already has no CHECK
-- constraint and current_period_end is already nullable, so no schema
-- change is needed there at all.

alter table public.analyses
  add column if not exists user_type text
    check (user_type in ('host', 'concierge', 'cohost', 'other')),
  add column if not exists property_count_range text
    check (property_count_range in ('1', '2-5', '6-20', '21+'));

create index if not exists analyses_user_type_idx on public.analyses (user_type);
create index if not exists analyses_property_count_range_idx on public.analyses (property_count_range);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses (id) on delete set null,
  email text,
  feedback_rating text check (feedback_rating in ('positive', 'negative')),
  feedback_text text,
  testimonial_text text,
  testimonial_permission boolean not null default false,
  plan text,
  user_type text,
  property_count_range text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_analysis_id_idx on public.feedback (analysis_id);
create index if not exists feedback_created_at_idx on public.feedback (created_at);

-- Same RLS pattern as every other table: service-role only, no public policies.
alter table public.feedback enable row level security;
