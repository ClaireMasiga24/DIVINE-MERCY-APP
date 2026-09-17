-- Holy Hour call log: one row per (auto Holy Hour meeting, member) recording
-- whether the call push reached that member, plus the retry state.
--
-- The alarm sweep used to discard the result of every push send, so a member
-- whose phone never rang left no trace anywhere. This table is purely additive
-- — no existing table or column is altered.

-- CreateEnum
CREATE TYPE "HolyHourCallStatus" AS ENUM ('PENDING', 'DELIVERED', 'NO_SUBSCRIPTION', 'FAILED');

-- CreateTable
CREATE TABLE "HolyHourCallLog" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "HolyHourCallStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HolyHourCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolyHourCallLog_meetingId_userId_key" ON "HolyHourCallLog"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "HolyHourCallLog_status_lastAttemptAt_idx" ON "HolyHourCallLog"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "HolyHourCallLog_meetingId_idx" ON "HolyHourCallLog"("meetingId");

-- AddForeignKey
ALTER TABLE "HolyHourCallLog" ADD CONSTRAINT "HolyHourCallLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolyHourCallLog" ADD CONSTRAINT "HolyHourCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
