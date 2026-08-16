-- CreateTable
CREATE TABLE "MeetingSignal" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "fromSessionId" TEXT NOT NULL,
    "toSessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSession" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSignal_meetingId_toSessionId_createdAt_idx" ON "MeetingSignal"("meetingId", "toSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingSession_meetingId_idx" ON "MeetingSession"("meetingId");

-- AddForeignKey
ALTER TABLE "MeetingSignal" ADD CONSTRAINT "MeetingSignal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
