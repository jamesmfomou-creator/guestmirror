-- Adds email capture to the funnel: collected right before analysis runs,
-- used to save/retrieve the analysis without requiring a full account.
alter table public.analyses
  add column if not exists email text;

create index if not exists analyses_email_idx on public.analyses (email);
