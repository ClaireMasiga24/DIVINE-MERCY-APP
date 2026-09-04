import { prisma } from "@/lib/prisma";

/**
 * True when the user may take part in the meeting: they are an invitee
 * (MeetingParticipant), the meeting's creator, or — for system-created Holy
 * Hour calls (isAuto) — any active member other than the Technical Lead (the
 * same exclusion set the alarm sweep uses). Every signaling, session and room
 * endpoint must check this against the meetingId in the request/URL — never
 * trust a client-supplied session claim.
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
      select: { createdById: true, isAuto: true, endedAt: true },
    }),
  ]);
  if (participant) return true;
  if (!meeting) return false;
  // A closed room is closed for everyone — no exceptions for creator or
  // direct invitees. `endedAt` is the single source of truth for "the call
  // has ended" (leader End Call, or the auto-end endpoint when the clock
  // hits endsAt). Late joiners get the dedicated "call has ended" screen
  // from the meeting-room page, not a misleading "not invited".
  if (meeting.endedAt !== null) return false;
  if (meeting.createdById === userId) return true;
  if (meeting.isAuto) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, role: true },
    });
    return user?.status === "ACTIVE" && user.role !== "TECHNICAL_LEAD";
  }
  return false;
}
