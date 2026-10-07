-- Post-P13: lock every web_ object out of Supabase's REST API (Data API).
-- Why: this shared project exposes `public` through PostgREST, and Supabase's default
-- privileges (pg_default_acl) grant anon + authenticated ALL on every table, view and
-- sequence `postgres` creates there. With RLS off, anyone holding the project URL + the
-- (public by design) anon key could read, edit, delete or truncate our data. Supabase's
-- security advisor flagged it (rls_disabled_in_public, 2026-10-03).
-- The site and the ETL never touch the REST API: they connect as `postgres` (owner,
-- BYPASSRLS), so none of this changes what they can read or write.
--
-- For every web_ object in `public`:
--   table    -> RLS on, no policies (same as 026)
--   view     -> security_invoker = on: it runs with the CALLER's grants and the base
--               tables' RLS, not the owner's. Without it a view bypasses RLS, and
--               web_v_pitch_scoped is auto-updatable (one table in FROM), so a REST
--               DELETE on it would have deleted web_statcast_events rows.
--   all      -> revoke anon / authenticated (incl. TRUNCATE, which RLS never covers).
-- service_role and the default privileges are left alone: both are shared with the other
-- project in this database.
--
-- Idempotent -- RE-RUN after creating any new web_ table or view: the default privileges
-- re-grant anon on each new object, and `create or replace view` resets security_invoker.
-- Apply via:  python etl/apply_migration.py db/migrations/027_rest_api_lockdown.sql

do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'web\_%'
      and c.relkind in ('r', 'v', 'S')
  loop
    if r.relkind = 'r' then
      execute format('alter table public.%I enable row level security', r.relname);
      execute format('revoke all on table public.%I from anon, authenticated', r.relname);
    elsif r.relkind = 'v' then
      execute format('alter view public.%I set (security_invoker = on)', r.relname);
      execute format('revoke all on table public.%I from anon, authenticated', r.relname);
    else
      execute format('revoke all on sequence public.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end $$;
