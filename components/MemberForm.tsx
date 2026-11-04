"use client";
// Design Ref: §3.2 ③ 위원 명단 탭 — 이름·메일·휴대폰 입력 (담당 팀원만)
import { useActionState, useState } from "react";

import { Button } from "@/components/Button";

export type MemberFormState = { errors: string[]; saved?: boolean; savedAt?: number };

type Values = { name: string; email: string; phone: string };

type MemberFormProps = {
  /** add = 위원 추가(저장 후 칸 비움), edit = 위원 정보 수정 */
  mode: "add" | "edit";
  action: (state: MemberFormState, formData: FormData) => Promise<MemberFormState>;
  initial?: Values;
};

const 입력칸 =
  "mt-1 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base " +
  "focus:border-primary focus:outline-2 focus:outline-primary";

export function MemberForm({ mode, action, initial }: MemberFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* 위원 추가에 성공할 때마다 key가 바뀌어 입력칸이 새로(빈 칸으로) 그려진다 */}
      <MemberFields key={mode === "add" ? (state.savedAt ?? 0) : "edit"} initial={initial} />

      {state.errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
          {state.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {mode === "add" && state.saved ? (
        <p role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-success">
          위원을 추가했습니다.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "저장 중…" : mode === "add" ? "위원 추가" : "위원 정보 저장"}
      </Button>
    </form>
  );
}

// 칸 값을 화면 상태로 들고 있어서, 서버에서 오류가 돌아와도 입력한 값이 지워지지 않는다
function MemberFields({ initial }: { initial?: Values }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="block">
        <span className="text-sm font-semibold">이름</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className={입력칸} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">메일</span>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={입력칸}
          placeholder="example@company.com"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">휴대폰 번호</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={입력칸}
          placeholder="010-1234-5678"
        />
      </label>
    </div>
  );
}
