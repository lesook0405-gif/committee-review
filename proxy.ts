// Design Ref: §8 보안 설계 — "관리자 화면(/admin)은 proxy에서 로그인 여부를 먼저 확인"
// 여기서는 쿠키 서명·만료만 빠르게 보고 길을 안내한다. (1차 확인)
// 실제 권한 확인은 각 화면·서버 처리에서 데이터베이스로 다시 한다. (lib/auth/session.ts — 2차 확인)
import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken } from "@/lib/auth/session-token";

const SESSION_COOKIE = "committee_session";

export function proxy(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  const { pathname } = request.nextUrl;

  // 로그인하지 않았으면 관리자 화면 대신 로그인 화면으로
  if (pathname.startsWith("/admin") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // 이미 로그인했으면 로그인 화면 대신 관리자 첫 화면으로
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/login"],
};
