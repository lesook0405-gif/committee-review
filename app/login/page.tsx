// Design Ref: §3.2 ① 로그인 화면 (/login)
import type { Metadata } from "next";

import { AppHeader } from "@/components/AppHeader";
import { PageContainer } from "@/components/PageContainer";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <>
      <AppHeader />
      <PageContainer>
        <div className="mx-auto w-full max-w-sm rounded-lg border border-border bg-surface p-6">
          <h1 className="text-xl font-bold">담당 팀원 · 팀장 로그인</h1>
          <p className="mt-1 mb-5 text-sm text-muted">위원은 로그인하지 않고, 받은 링크로 들어옵니다.</p>
          <LoginForm />
        </div>
      </PageContainer>
    </>
  );
}
