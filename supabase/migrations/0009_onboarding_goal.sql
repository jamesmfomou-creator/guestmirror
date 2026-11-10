-- Onboarding "objectif" question (funnel optimization mission, variant B
-- only -- see StepGoal.tsx). Non-destructive: adds one nullable column,
-- same pattern as 0005_profile_and_feedback.sql's user_type/
-- property_count_range.
alter table public.analyses
  add column if not exists goal text
    check (goal in ('improve_appeal', 'reduce_hesitation', 'verify_improvements', 'optimize_multiple'));

create index if not exists analyses_goal_idx on public.analyses (goal);
