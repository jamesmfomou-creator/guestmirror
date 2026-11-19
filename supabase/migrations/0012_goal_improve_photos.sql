-- Journey goal_value_v1: new onboarding goal "Améliorer mes photos et ma
-- présentation" (improve_photos). Non-destructive: only widens the check
-- constraint created in 0009_onboarding_goal.sql; every existing value stays
-- valid, no row is touched.
--
-- Safe to run before or after the code that sends improve_photos: until it
-- runs, lib/store.ts stores such an analysis without its goal instead of
-- failing.

alter table public.analyses drop constraint if exists analyses_goal_check;
alter table public.analyses
  add constraint analyses_goal_check
    check (goal in ('improve_appeal', 'reduce_hesitation', 'improve_photos', 'verify_improvements', 'optimize_multiple'));
