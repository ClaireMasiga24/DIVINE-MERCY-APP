-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "location" TEXT,
ADD COLUMN     "notified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 15;
