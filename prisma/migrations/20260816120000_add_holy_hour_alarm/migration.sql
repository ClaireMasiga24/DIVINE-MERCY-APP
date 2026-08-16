-- Add the recurring weekly Holy Hour alarm configuration to the global AppSetting row.
ALTER TABLE "AppSetting"
  ADD COLUMN "holyHourEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holyHourDayOfWeek" INTEGER,
  ADD COLUMN "holyHourTime" TEXT,
  ADD COLUMN "holyHourLastFiredAt" TIMESTAMP(3);

-- Support the due-reminder sweep query (remindAt <= now AND isSent = false).
CREATE INDEX "Reminder_remindAt_isSent_idx" ON "Reminder"("remindAt", "isSent");
