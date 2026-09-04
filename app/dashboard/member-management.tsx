import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import AddMemberForm from "./add-member-form";
import MemberActions from "./member-actions";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-xs font-semibold tracking-[0.25em] text-dim">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

/**
 * The account-management UI shown in the "Members" section of the roles that
 * have account authority (Chairperson, Patron, Technical Lead). The Technical
 * Lead's account stays invisible to the other two: they don't see the row, the
 * "added by" attribution, or the TECHNICAL_LEAD role in any picker.
 */
export default async function MemberManagement({ user }: { user: User }) {
  const isTechLead = user.role === "TECHNICAL_LEAD";

  const members = await prisma.user.findMany({
    where: isTechLead ? undefined : { role: { not: "TECHNICAL_LEAD" } },
    select: {
      id: true,
      fullName: true,
      phoneNumber: true,
      role: true,
      status: true,
      birthday: true,
      createdAt: true,
      addedBy: { select: { fullName: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel>ADD A MEMBER</SectionLabel>
        <AddMemberForm canAssignTechLead={isTechLead} />
      </section>

      <section>
        <SectionLabel>MEMBERS · {members.length}</SectionLabel>
        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-ivory px-5 py-10 text-center text-sm text-dim">
            No members yet. Add the first one above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-ivory shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-ivory-lift text-[11px] uppercase tracking-[0.15em] text-dim">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Birthday</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Added</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((m) => (
                    <tr key={m.id} className="transition hover:bg-ivory-lift/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">
                          {m.fullName}
                          {m.id === user.id && (
                            <span className="ml-1.5 text-xs font-normal text-gold">· you</span>
                          )}
                        </div>
                        {m.addedBy && (isTechLead || m.addedBy.role !== "TECHNICAL_LEAD") && (
                          <div className="text-xs text-dim">added by {m.addedBy.fullName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dim">{m.phoneNumber}</td>
                      <td className="px-4 py-3 text-dim">
                        {m.birthday
                          ? new Date(m.birthday).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "long",
                            })
                          : <span className="text-dim/60">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {m.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold">
                            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dim line-through">
                            <span className="h-1.5 w-1.5 rounded-full bg-cream-dim/50" />
                            DEACTIVATED
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-dim">
                        {new Date(m.createdAt).toLocaleDateString("en-UG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <MemberActions
                          memberId={m.id}
                          fullName={m.fullName}
                          phoneNumber={m.phoneNumber}
                          birthday={m.birthday ? m.birthday.toISOString() : null}
                          role={m.role}
                          status={m.status}
                          isSelf={m.id === user.id}
                          canAssignTechLead={isTechLead}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
