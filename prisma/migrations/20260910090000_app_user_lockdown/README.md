# Lock down the database with a least-privilege role

## Why

Until now the application connected to Supabase as the project's `postgres`
superuser via `DATABASE_URL`. That bypasses Postgres Row-Level Security
entirely, so every table in the `public` schema was effectively wide open
to anyone who held the connection string — including anonymous PostgREST
traffic from the Supabase project URL.

This migration does two things, in order:

1. **Creates a non-superuser role `app_user`** that the application will
   connect as. Password is taken from a psql variable (`app_db_password`)
   so it never lands in this file or in git history — set it from `.env`
   at run-time.
2. **Revokes the default Supabase `public` grants** and replaces them with
   narrowly scoped per-table privileges. The application keeps everything
   it actually uses; nothing more.

No RLS, no policies, no app-side changes. The role boundary is the security
boundary.

## What you need to do

### 1. Generate the password

A strong 32-char password is generated for you: see
`APP_DB_PASSWORD` in your local `.env`. Add it if not already there:

```
APP_DB_PASSWORD=n92aeySm_FaBrKS2_we5NvFZCqSQBX4M
```

### 2. Apply the migration to the live DB

Open the Supabase SQL Editor for project `aqmcuouoymeodikhwgle` and run
`migration.sql`. The SQL Editor doesn't expose psql `\set`, so use this
form to pass the password at runtime:

1. Open a new query in the SQL Editor.
2. Paste the body of `migration.sql`.
3. **Before line 1**, insert this line (replacing the placeholder with
   the value of `APP_DB_PASSWORD` from your local `.env`):

   ```sql
   SELECT set_config('app.db_password', 'PASTE_FROM_ENV_HERE', false);
   ```

   The `false` makes the value SESSION-scoped (not transaction-local) so
   the `current_setting('app.db_password', true)` call inside the DO block
   can find it.

4. Run.

The `DO $$ ... $$` block reads the password via
`current_setting('app.db_password', true)`. If you forget the `set_config`
preamble, the block will raise `unrecognized configuration parameter
"app.db_password"` and the role won't be created — the rest of the script
will still apply (which is fine, it's idempotent).

### 3. Switch the application's connection string

In `.env`, change `DATABASE_URL` and `DIRECT_URL` from `postgres.xxx` to
`app_user`:

```
DATABASE_URL="postgresql://app_user:n92aeySm_FaBrKS2_we5NvFZCqSQBX4M@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://app_user:n92aeySm_FaBrKS2_we5NvFZCqSQBX4M@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
```

### 4. Verify

After deploying:

- The app should behave identically — every call site uses only the
  privileges granted above.
- Direct anonymous PostgREST queries (anyone hitting
  `https://<ref>.supabase.co/rest/v1/...` with no API key) will now be
  rejected because the implicit `anon` / `authenticated` roles have no
  privileges on these tables after the REVOKE.
- The `postgres` superuser still works for migrations (your migration
  script connects with the admin credential). Keep that credential out
  of the app's connection string.

## What this migration deliberately does NOT do

- **It does NOT drop the `postgres` role or change its password.** Keep
  the admin credential in a separate vault. Future migrations and any
  manual DB work should use it; the app never should.
- **It does NOT touch Supabase Auth** — there is none in this codebase.
- **It does NOT enable RLS or add policies.** That would require setting
  a per-request session variable (`app.current_user_id`) across ~30 call
  sites in the application, which is a separate piece of work. The role
  boundary is the security boundary here; row-level policies are a
  follow-up if/when needed.

## Reverting

If something goes wrong, run the `DOWN` section at the bottom of
`migration.sql` (or restore from a Supabase point-in-time backup).