// Design Ref: §3.2 ③ 회의 탭 — 회의 목록(회차, 일시, 상태: 진행 중/마감), [+ 회의 등록]
import Link from "next/link";

import { MeetingForm } from "@/components/MeetingForm";
import { listMeetings } from "@/lib/db/meetings";
import { listMembers } from "@/lib/db/members";
import { formatKoreanDateTime } from "@/lib/format";

import { createMeetingAction } from "../../meetings/actions";

export async function MeetingsTab({ committeeId, canEdit }: { committeeId: string; canEdit: boolean }) {
  const [meetings, members] = await Promise.all([listMeetings(committeeId), canEdit ? listMembers(committeeId) : []]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold">
          회의 <span className="text-base font-normal text-muted">{meetings.length}건</span>
        </h2>
        {meetings.length === 0 ? (
          <p className="text-muted">아직 등록된 회의가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/meetings/${m.id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3 hover:text-primary"
                >
                  <span className="font-semibold">{m.title}</span>
                  <span className="flex flex-wrap items-center gap-3 text-sm text-muted">
                    <span>{formatKoreanDateTime(m.startsAt)}</span>
                    <span>참석 {m.participantCount}명</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        m.status === "closed" ? "bg-background text-muted" : "bg-blue-50 text-primary"
                      }`}
                    >
                      {m.status === "closed" ? "마감" : "진행 중"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!canEdit ? <p className="mt-3 text-sm text-muted">팀장 계정은 열람만 할 수 있습니다.</p> : null}
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold">+ 회의 등록</h2>
          <MeetingForm
            action={createMeetingAction.bind(null, committeeId)}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
          />
        </section>
      ) : null}
    </div>
  );
}
