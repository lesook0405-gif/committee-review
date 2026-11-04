// 위원회 등록 화면 (/admin/committees/new) — 담당 팀원만
import type { Metadata } from "next";
import { Suspense } from "react";

import { LinkButton } from "@/components/Button";
import { PageContainer } from "@/components/PageContainer";
import { ScoringForm } from "@/components/ScoringForm";
import { requireStaff } from "@/lib/auth/session";

import { createCommitteeAction } from "../actions";

export const metadata: Metadata = { title: "위원회 등록" };

export default function NewCommitteePage() {
  return (
    <PageContainer
      title="위원회 등록"
      description="평가 방식은 이 위원회의 모든 회의에 똑같이 적용되며, 첫 평가가 제출되면 바꿀 수 없습니다."
    >
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <NewCommittee />
      </Suspense>
    </PageContainer>
  );
}

async function NewCommittee() {
  const staff = await requireStaff();
  if (staff.role !== "staff") {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <p>팀장 계정은 열람만 할 수 있습니다. 위원회 등록은 담당 팀원 계정으로 해 주세요.</p>
        <LinkButton href="/admin" variant="secondary" className="mt-4">
          위원회 목록으로
        </LinkButton>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <ScoringForm mode="create" action={createCommitteeAction} />
    </div>
  );
}
