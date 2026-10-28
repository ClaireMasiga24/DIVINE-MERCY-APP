-- Enable Row-Level Security on every table in the public schema.
--
-- Safe to run repeatedly: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is a
-- no-op when RLS is already enabled on a table, and the loop only touches
-- base tables (pg_tables) in schema 'public'.
--
-- NOTE: this enables RLS but adds NO policies. With RLS enabled and no
-- policies, Postgres applies default-deny to every non-superuser,
-- non-table-owner role -- including `app_user`, the role this app connects
-- as. Run this only after per-table policies exist, or accept that the app
-- loses all table access until they do. See
-- prisma/migrations/20260910090000_app_user_lockdown/README.md.
--
-- Run: npm run db:secure   (prisma db execute --file prisma/rls.sql)

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;
