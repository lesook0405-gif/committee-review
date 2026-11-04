// 담당 팀원·팀장 화면 공통 틀 — 상단에 로그인한 사람과 로그아웃
// cacheComponents 규칙: 로그인 정보(쿠키)를 읽는 부분은 Suspense 안에 둔다. (틀은 바로 보이고 이름만 뒤따라 나타남)
import { Suspense } from "react";

import { AppHeader } from "@/components/AppHeader";

import { StaffMenu } from "./StaffMenu";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <AppHeader homeHref="/admin">
        <Suspense fallback={<span className="text-sm text-muted">확인 중…</span>}>
          <StaffMenu />
        </Suspense>
      </AppHeader>
      {children}
    </>
  );
}
