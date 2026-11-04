"use client";
// Design Ref: §3.2 ① 로그인 — 이메일, 비밀번호, 로그인 버튼 (가입 링크 없음)
import { useActionState } from "react";

import { Button } from "@/components/Button";

import { login, type LoginState } from "./actions";

const 처음_상태: LoginState = { error: null, email: "" };

const 입력칸 =
  "mt-1 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base " +
  "focus:border-primary focus:outline-2 focus:outline-primary";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, 처음_상태);

  return (
    <form action={action} className="space-y-4" noValidate>
      <label className="block">
        <span className="text-sm font-semibold">이메일</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className={입력칸}
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" required className={입력칸} />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "확인 중…" : "로그인"}
      </Button>
      <p className="text-sm text-muted">※ 가입 화면은 없습니다. 계정은 미리 등록된 담당 팀원·팀장만 사용할 수 있습니다.</p>
    </form>
  );
}
