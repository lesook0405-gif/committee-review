// Design Ref: §3.2 ① 로그인 화면 (/login) — 건물 사진 배경의 첫 화면. 위원 안내는 화면 하단에 둔다.
import type { Metadata } from "next";

import { LoginHero } from "@/components/LoginHero";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <LoginHero>
      <LoginForm />
    </LoginHero>
  );
}
