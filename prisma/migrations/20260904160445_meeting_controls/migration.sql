-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "musicPlaying" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Meeting" ADD COLUMN "musicPausedAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "musicPausedById" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "endedById" TEXT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_musicPausedById_fkey" FOREIGN KEY ("musicPausedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;