-- Reliability audit follow-up (non-destructive: adds columns/indexes only,
-- touches no existing data).
--
-- attempt_id: lets createAnalysis() (src/lib/store.ts) recognize a
-- resubmission of the same client-side attempt and return the existing
-- analysis instead of creating a duplicate + paying for a second AI call.
-- The application code already does a check-then-insert on this column;
-- this unique index is the DB-level backstop that closes the remaining
-- race between two concurrent requests for the same attempt (the
-- application-level check alone can't fully close that race).
alter table public.analyses
  add column if not exists attempt_id text;

create unique index if not exists analyses_attempt_id_unique_idx
  on public.analyses (attempt_id)
  where attempt_id is not null;

-- payments.stripe_session_id: Stripe redelivers webhooks it doesn't get a
-- 2xx response for (at-least-once delivery). The webhook handler
-- (handleOneTimeCheckout, src/app/api/stripe/webhook/route.ts) already
-- checks for an existing row by stripe_session_id before inserting; this
-- index is the DB-level backstop for the same reason as above, and also
-- makes that existing lookup fast.
create unique index if not exists payments_stripe_session_id_unique_idx
  on public.payments (stripe_session_id)
  where stripe_session_id is not null;
