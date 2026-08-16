-- The Holy Hour alarm is now inbuilt and always on: daily at fixed times
-- (03:00 and 15:00, Africa/Kampala). The weekly day/time configuration and
-- the enable flag are obsolete.
ALTER TABLE "AppSetting"
  DROP COLUMN "holyHourDayOfWeek",
  DROP COLUMN "holyHourTime",
  DROP COLUMN "holyHourEnabled";
