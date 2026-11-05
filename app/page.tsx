// Plan 6장 영향 분석 — 기본 안내 화면을 서비스 첫 화면(로그인 안내)으로 바꾼다.
// 첫 화면(/)과 로그인(/login)은 같은 디자인을 쓴다. (이미 로그인한 사람은 proxy가 /login에서 관리자 화면으로 보낸다.)
import { LoginHero } from "@/components/LoginHero";

import { LoginForm } from "./login/LoginForm";

export default function Home() {
  return (
    <LoginHero>
      <LoginForm />
    </LoginHero>
  );
}
