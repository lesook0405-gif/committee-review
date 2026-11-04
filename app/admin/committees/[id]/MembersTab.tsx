// Design Ref: §3.2 ③ 위원 명단 탭 — 표(이름, 메일, 휴대폰 010-****-1234), [위원 추가]
// 휴대폰 번호는 서버에서 가린 값만 받는다 (lib/db/members.ts). 전체 번호는 담당 팀원의 수정 화면에서만.
import Link from "next/link";

import { MemberForm } from "@/components/MemberForm";
import { listMembers } from "@/lib/db/members";

import { addMemberAction } from "./members/actions";

export async function MembersTab({ committeeId, canEdit }: { committeeId: string; canEdit: boolean }) {
  const members = await listMembers(committeeId);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold">
          위원 명단 <span className="text-base font-normal text-muted">{members.length}명</span>
        </h2>
        {members.length === 0 ? (
          <p className="text-muted">아직 등록된 위원이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead>
                <tr className="border-b border-border text-sm text-muted">
                  <th className="py-2 pr-3">이름</th>
                  <th className="py-2 pr-3">메일</th>
                  <th className="py-2 pr-3">휴대폰</th>
                  {canEdit ? <th className="py-2 text-right">관리</th> : null}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-border">
                    <td className="py-2 pr-3">{member.name}</td>
                    <td className="py-2 pr-3 break-all">{member.email}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{member.phoneMasked}</td>
                    {canEdit ? (
                      <td className="py-2 text-right">
                        <Link
                          href={`/admin/committees/${committeeId}/members/${member.id}`}
                          className="inline-flex min-h-11 items-center px-2 text-primary hover:underline"
                        >
                          수정
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!canEdit ? <p className="mt-3 text-sm text-muted">팀장 계정은 열람만 할 수 있습니다.</p> : null}
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold">위원 추가</h2>
          <MemberForm mode="add" action={addMemberAction.bind(null, committeeId)} />
        </section>
      ) : null}
    </div>
  );
}
