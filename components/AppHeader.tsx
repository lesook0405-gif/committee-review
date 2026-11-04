// Design Ref: §3.2 ② 상단 — "서비스 이름 · 로그인한 사람(역할) · 로그아웃"
// 오른쪽 칸(children)에는 화면마다 필요한 것을 넣는다. (로그인한 사람·로그아웃은 작업 6에서 연결)
import Link from "next/link";
import type { ReactNode } from "react";

type AppHeaderProps = {
  /** 서비스 이름을 눌렀을 때 갈 주소 (담당 팀원·팀장은 /admin, 위원은 자기 링크 첫 화면) */
  homeHref?: string;
  /** 서비스 이름 옆에 작게 붙는 설명 (예: 회의 이름) */
  subtitle?: string;
  /** 오른쪽 칸 */
  children?: ReactNode;
};

export function AppHeader({ homeHref = "/", subtitle, children }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <Link href={homeHref} className="text-lg font-bold text-foreground hover:text-primary">
            심사위원회 운영 서비스
          </Link>
          {subtitle ? <span className="truncate text-sm text-muted">{subtitle}</span> : null}
        </div>
        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </header>
  );
}
