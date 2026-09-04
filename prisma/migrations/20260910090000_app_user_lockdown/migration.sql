-- ============================================================================
-- Lock down the database with a least-privilege role.
--
-- The application previously connected to Supabase as the project's
-- `postgres` superuser. That bypasses Postgres Row-Level Security entirely,
-- so every table in the `public` schema was effectively wide open to anyone
-- who held the connection string — including anonymous PostgREST traffic
-- from the Supabase project URL.
--
-- This migration does two things:
--
--   1. Creates a non-superuser role `app_user` (NOSUPERUSER, NOBYPASSRLS)
--      that the application will connect as. Password is taken from a psql
--      variable so it never lands in this file or in git history.
--   2. Revokes the broad Supabase `public` grants and replaces them with
--      narrowly scoped per-table privileges — only what the application
--      actually uses, no more.
--
-- No RLS, no policies, no app-side changes. The role boundary is the
-- security boundary.
--
-- Run via psql with the password passed as a variable (so the secret never
-- lands in this file or git history):
--
--   psql "$DIRECT_URL" \
--     -v app_db_password="$APP_DB_PASSWORD" \
--     -f prisma/migrations/20260910090000_app_user_lockdown/migration.sql
--
-- Or via the Supabase SQL Editor: see README.md in this directory for the
-- one-line `SELECT set_config` form that supplies the password at runtime.
-- ============================================================================

-- ============================================================================
-- 1. Create the least-privilege role the app will use.
-- ============================================================================
-- NOSUPERUSER + NOBYPASSRLS is the critical bit. We deliberately grant
-- LOGIN but not replication / superuser rights.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format(
      'CREATE ROLE app_user LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION',
      current_setting('app.db_password', true)
    );
  END IF;
END
$$;

-- Belt-and-suspenders: explicitly bypass RLS = false even if future ALTER
-- ROLE changes try to flip it.
ALTER ROLE app_user NOBYPASSRLS;

-- ============================================================================
-- 2. Revoke the broad Supabase defaults from PUBLIC.
-- ============================================================================
-- Supabase leaves generous grants in place so anon can use PostgREST. The
-- app here talks to Postgres directly via Prisma; we lock everything down
-- to app_user only.

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Future objects inherit the locked-down defaults too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES    FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- Allow app_user to USE the schema (needed for any table access at all).
GRANT USAGE ON SCHEMA public TO app_user;

-- ============================================================================
-- 3. Grant per-table privileges — narrowly scoped to what the app does.
-- ============================================================================
-- Each GRANT block is annotated with the call sites it covers. If you add
-- a new prisma.<table>.<op> call site, add the matching GRANT here.

-- AppSetting: discussion toggle, holy-hour/birthday claim markers.
--   lib/conversations.isDiscussionEnabled, lib/alarms.fireDailyHolyHour,
--   lib/alarms.fireBirthdays, app/api/settings/route.ts.
GRANT SELECT, INSERT, UPDATE ON TABLE "AppSetting" TO app_user;

-- User: member directory + login + management.
--   lib/auth.getSessionUser, app/api/auth/login/route.ts,
--   app/api/members/*, app/dashboard/member-management.tsx, lib/alarms.ts.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "User" TO app_user;

-- Post + Comment: discussion feed.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Post"    TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Comment" TO app_user;

-- Conversations: 1:1 chat.
GRANT SELECT, INSERT                  ON TABLE "Conversation"             TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE "ConversationParticipant"  TO app_user;
GRANT SELECT, INSERT                  ON TABLE "Message"                  TO app_user;

-- Events + reminders.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Event"         TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "EventAttendee" TO app_user;
GRANT SELECT, INSERT, UPDATE         ON TABLE "Reminder"      TO app_user;

-- Meetings: create (lib/alarms.ensureHolyHourCall), update (music/end_call/
-- auto_end), read for room rendering.
GRANT SELECT, INSERT, UPDATE ON TABLE "Meeting"            TO app_user;
GRANT SELECT, INSERT         ON TABLE "MeetingParticipant" TO app_user;
-- Signals: write to push, read+delete on poll (transactional consume).
GRANT SELECT, INSERT, DELETE ON TABLE "MeetingSignal"      TO app_user;
-- Sessions: presence upsert + leave-delete.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "MeetingSession" TO app_user;

-- Prayer resources — read-only at runtime (seeded via migrations only).
GRANT SELECT ON TABLE "PrayerResource" TO app_user;

-- Announcements.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Announcement" TO app_user;

-- Notifications + deliveries.
GRANT SELECT, INSERT, UPDATE         ON TABLE "Notification"         TO app_user;
GRANT SELECT, INSERT, UPDATE         ON TABLE "NotificationDelivery" TO app_user;

-- Device tokens: subscribe/unsubscribe.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "DeviceToken" TO app_user;

-- Sequences: every uuid generator needs USAGE on the underlying seq.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================================
-- DOWN (manual rollback) — uncomment + run if you need to revert.
-- ============================================================================
-- REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM app_user;
-- REVOKE ALL ON TABLE "DeviceToken"           FROM app_user;
-- REVOKE ALL ON TABLE "NotificationDelivery"  FROM app_user;
-- REVOKE ALL ON TABLE "Notification"          FROM app_user;
-- REVOKE ALL ON TABLE "Announcement"          FROM app_user;
-- REVOKE ALL ON TABLE "PrayerResource"        FROM app_user;
-- REVOKE ALL ON TABLE "MeetingSession"        FROM app_user;
-- REVOKE ALL ON TABLE "MeetingSignal"         FROM app_user;
-- REVOKE ALL ON TABLE "MeetingParticipant"    FROM app_user;
-- REVOKE ALL ON TABLE "Meeting"               FROM app_user;
-- REVOKE ALL ON TABLE "Reminder"              FROM app_user;
-- REVOKE ALL ON TABLE "EventAttendee"         FROM app_user;
-- REVOKE ALL ON TABLE "Event"                 FROM app_user;
-- REVOKE ALL ON TABLE "Message"               FROM app_user;
-- REVOKE ALL ON TABLE "ConversationParticipant" FROM app_user;
-- REVOKE ALL ON TABLE "Conversation"          FROM app_user;
-- REVOKE ALL ON TABLE "Comment"               FROM app_user;
-- REVOKE ALL ON TABLE "Post"                  FROM app_user;
-- REVOKE ALL ON TABLE "User"                  FROM app_user;
-- REVOKE ALL ON TABLE "AppSetting"            FROM app_user;
-- REVOKE USAGE ON SCHEMA public FROM app_user;
-- GRANT USAGE ON SCHEMA public TO PUBLIC;
-- GRANT ALL ON ALL TABLES    IN SCHEMA public TO PUBLIC;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
-- GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
-- DROP ROLE IF EXISTS app_user;