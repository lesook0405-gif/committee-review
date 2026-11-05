// Design Ref: §3.2 ⑥~⑨ 위원 화면의 바깥 틀 — 로그인 없이 링크로만 들어온다.
// 관리 버튼(업로드·수정·삭제·로그아웃)은 두지 않는다. 링크 확인은 각 화면에서 매번 다시 한다.
// 상단 머리글은 위원 자기 링크 첫 화면으로 돌아가야 해서 각 화면(MemberShell)에서 그린다.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "위원 화면",
  // 주소에 링크값이 있으므로 다른 사이트로 넘어갈 때 주소를 알려 주지 않는다 (next.config.ts 응답 머리글과 같은 설정)
  referrer: "no-referrer",
};

export default function MemberLayout({ children }: LayoutProps<"/m/[token]">) {
  return <>{children}</>;
}
