// Design Ref: §3.2 ② 위원회 목록 (/admin) — 위원회 카드(이름·위원 수·최근 회의), 등록 버튼(담당 팀원만)
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LinkButton } from "@/components/Button";
import { PageContainer } from "@/components/PageContainer";
import { requireStaff } from "@/lib/auth/session";
import { listCommittees } from "@/lib/db/committees";
import { formatKoreanDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "위원회 목록" };

export default function AdminHomePage() {
  return (
    <PageContainer title="위원회 목록">
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <AdminHome />
      </Suspense>
    </PageContainer>
  );
}

async function AdminHome() {
  // 화면마다 서버에서 다시 확인한다 (proxy·상단 메뉴의 확인만 믿지 않는다)
  const staff = await requireStaff();
  const committees = await listCommittees();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {staff.role === "lead"
            ? "팀장 계정은 열람만 할 수 있습니다. 위원회별 진행 상황과 평가 결과를 확인할 수 있습니다."
            : "담당 팀원 계정입니다. 위원회를 등록하고 회의·안건을 관리할 수 있습니다."}
        </p>
        {staff.role === "staff" ? <LinkButton href="/admin/committees/new">+ 위원회 등록</LinkButton> : null}
      </div>

      {committees.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-muted">
          아직 등록된 위원회가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {committees.map((committee) => (
            <li key={committee.id}>
              <Link
                href={`/admin/committees/${committee.id}`}
                className="block min-h-11 rounded-lg border border-border bg-surface p-4 hover:border-primary"
              >
                <span className="block text-lg font-semibold">{committee.name}</span>
                <span className="mt-1 block text-sm text-muted">
                  위원 {committee.memberCount}명 · 최근 회의{" "}
                  {committee.latestMeetingAt ? formatKoreanDateTime(committee.latestMeetingAt) : "없음"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
