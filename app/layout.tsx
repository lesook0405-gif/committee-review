// Design Ref: §3 화면 구성 — 모든 화면이 공유하는 바깥 틀 (한국어, 서비스 이름, 공통 글꼴·색상)
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "심사위원회 운영 서비스",
    template: "%s · 심사위원회 운영 서비스",
  },
  description: "심사위원회 안건 열람과 위원 평가·자동 집계를 종이 없이 운영하는 서비스",
  // 대외비 업무용 서비스라 검색 엔진에 노출하지 않는다
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
