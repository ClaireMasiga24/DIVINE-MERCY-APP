-- ============================================================================
-- DB-backed, device-bound sessions.
--
-- Replaces the previous JWT-only auth. The `dm_session` cookie now carries
-- an opaque UUID that points at a `Session` row, and every protected
-- request verifies `deviceId` matches the `dm_device` cookie too.
--
-- Logout = set `revokedAt` on the row. Old JWT cookies from before this
-- migration just fail the lookup and the user re-logs in.
--
-- Wrapped in BEGIN/COMMIT so the table and the GRANT land atomically —
-- a partial state would break login immediately.
-- ============================================================================

BEGIN;

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_userId_idx"      ON "Session"("userId");
CREATE INDEX "Session_deviceId_idx"    ON "Session"("deviceId");
CREATE INDEX "Session_expiresAt_idx"   ON "Session"("expiresAt");

ALTER TABLE "Session"
    ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Runtime role needs the same per-table grant pattern as the lockdown
-- migration. Without this the app can't read/write sessions and login
-- returns 401 for every user.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Session" TO app_user;

COMMIT;
