import { prisma } from "@/lib/prisma";

/**
 * True when the user may take part in the meeting: they are an invitee
 * (MeetingParticipant) or the meeting's creator. Every signaling, session and
 * room endpoint must check this against the meetingId in the request/URL —
 * never trust a client-supplied session claim.
 */
export async function isMeetingParticipant(
  meetingId: string,
  userId: string
): Promise<boolean> {
  const [participant, meeting] = await Promise.all([
    prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
      select: { id: true },
    }),
    prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { createdById: true },
    }),
  ]);
  return Boolean(participant) || meeting?.createdById === userId;
}
