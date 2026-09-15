-- Anti-duplicate tracking for one-off email campaigns (e.g. the
-- non-buyer feedback request). One row per (email, campaign_key): the
-- unique constraint is the actual hard guarantee that the same person
-- never receives the same campaign twice, enforced by Postgres itself,
-- not just by application logic checking before each send.
--
-- delivered_at/opened_at/clicked_at are ready to be filled in if a
-- Resend webhook receiver is added later -- not built in this pass (see
-- the campaign report), only sent_at is populated by the send script.

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  campaign_key text not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email, campaign_key)
);

create index if not exists email_campaign_sends_campaign_key_idx on public.email_campaign_sends (campaign_key);

-- Same RLS pattern as every other table: service-role only, no public policies.
alter table public.email_campaign_sends enable row level security;
