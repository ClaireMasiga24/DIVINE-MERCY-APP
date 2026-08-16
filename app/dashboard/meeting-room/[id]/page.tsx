import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMeetingParticipant } from "@/lib/meeting-access";
import { roleSlug } from "@/lib/roles";
import MeetingRoom from "../../meeting-room-client";

/**
 * The in-app video call room. Only the meeting's participants (invitees and
 * the creator) may enter — anyone else sees a "not invited" screen. The
 * Technical Lead can never be an invitee, so they can never join.
 */
export default async function MeetingRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, title: true, startsAt: true },
  });
  if (!meeting) redirect(`/dashboard/${roleSlug(user.role)}`);

  const allowed = await isMeetingParticipant(meeting.id, user.id);
  if (!allowed) {
    const homeHref = `/dashboard/${roleSlug(user.role)}`;
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-line bg-ivory px-6 py-12 text-center shadow-sm">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full bg-gradient-to-b from-[#D9B76A] to-[#C9A24E] p-[2px]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
              <Image
                src="/Images/SEETA PARISH DIVINE MERCY.png"
                alt=""
                fill
                className="object-cover"
              />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-ink">You&apos;re not invited</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-dim">
            This is a private meeting. Only invited members can join the call.
          </p>
          <Link
            href={homeHref}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gold-deep transition hover:bg-gold/20"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <MeetingRoom
      meetingId={meeting.id}
      title={meeting.title}
      fullName={user.fullName}
      homeHref={`/dashboard/${roleSlug(user.role)}`}
    />
  );
}
