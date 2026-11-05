"use client";
// Design Ref: §3.2 ① 로그인 — 이메일, 비밀번호, 로그인 버튼 (가입 링크 없음)
// 모양은 components/login-hero.css를 쓴다. 로그인 처리(login 서버 처리)는 그대로다.
import { useActionState, useState } from "react";

import "@/components/login-hero.css";

import { login, type LoginState } from "./actions";

const 처음_상태: LoginState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, 처음_상태);
  const [보임, set보임] = useState(false);

  return (
    <form action={action} className="lh-form" noValidate>
      <div className="lh-fieldBox">
        <label className="lh-label" htmlFor="login-email">
          이메일
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="이메일을 입력하세요"
          required
          defaultValue={state.email}
          className="lh-input"
        />
      </div>

      <div className="lh-fieldBox">
        <label className="lh-label" htmlFor="login-password">
          비밀번호
        </label>
        <input
          id="login-password"
          name="password"
          type={보임 ? "text" : "password"}
          autoComplete="current-password"
          placeholder="비밀번호를 입력하세요"
          required
          className="lh-input lh-hasEye"
        />
        <button
          type="button"
          className="lh-eye"
          onClick={() => set보임((v) => !v)}
          aria-label={보임 ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={보임}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {보임 ? <path d="M4 4l16 16" /> : null}
          </svg>
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="lh-error">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="lh-submit">
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
