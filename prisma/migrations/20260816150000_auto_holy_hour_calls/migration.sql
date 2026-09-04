-- Automatic Holy Hour calls: system-created meetings need no human creator,
-- and an isAuto flag lets access control open the room to every active member.
ALTER TABLE "Meeting" ADD COLUMN "isAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Meeting" ALTER COLUMN "createdById" DROP NOT NULL;
