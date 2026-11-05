// 위원 화면 공통 틀 — 상단(서비스 이름 → 내 안건 목록, 회의 이름, 위원 이름)과 본문 상자.
// 위원 화면에는 로그아웃·관리 버튼이 없다.
import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { PageContainer } from "@/components/PageContainer";
import { LINK_DENIAL_MESSAGE, type LinkDenial } from "@/lib/auth/member-link";

export function MemberShell({ token, meetingTitle, memberName, children }: { token: string; meetingTitle: string; memberName: string; children: ReactNode }) {
  return (
    <>
      <AppHeader homeHref={`/m/${token}`} subtitle={meetingTitle}>
        <span className="text-sm font-semibold">{memberName} 위원님</span>
      </AppHeader>
      <PageContainer>{children}</PageContainer>
    </>
  );
}

/** 링크로 들어올 수 없을 때 보여 주는 안내 (이유별 한국어 한 줄) */
export function LinkDenied({ reason }: { reason: LinkDenial }) {
  return (
    <>
      <AppHeader />
      <PageContainer title="링크를 사용할 수 없습니다">
        <p role="alert" className="rounded-lg border border-border bg-surface p-5 text-base">
          {LINK_DENIAL_MESSAGE[reason]}
        </p>
      </PageContainer>
    </>
  );
}
