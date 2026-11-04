// Design Ref: §3.2 ② 위원회 목록 (/admin) — 이번 작업(6)에서는 로그인·역할 확인까지만, 목록과 등록은 작업 7에서
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageContainer } from "@/components/PageContainer";
import { requireStaff } from "@/lib/auth/session";

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
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      {staff.role === "lead" ? (
        <p>팀장 계정은 열람만 할 수 있습니다. 위원회별 진행 상황과 평가 결과를 확인할 수 있습니다.</p>
      ) : (
        <p>담당 팀원 계정입니다. 위원회를 등록하고 회의·안건을 관리할 수 있습니다.</p>
      )}
      <p className="mt-3 text-sm text-muted">위원회 목록과 등록 기능은 다음 작업(PLAN 작업 7)에서 연결됩니다.</p>
    </section>
  );
}
