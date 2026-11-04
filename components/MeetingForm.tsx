"use client";
// Design Ref: §5.2 회의 등록 — 회차 이름, 회의 일시(한국 시간), 참석 위원
import { useActionState, useState } from "react";

import { Button } from "@/components/Button";

type State = { errors: string[]; saved?: boolean };

type MeetingFormProps = {
  action: (state: State, formData: FormData) => Promise<State>;
  members: { id: string; name: string }[];
};

const 입력칸 =
  "mt-1 block min-h-11 rounded-md border border-border bg-surface px-3 text-base " +
  "focus:border-primary focus:outline-2 focus:outline-primary";

export function MeetingForm({ action, members }: MeetingFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  // 모든 칸을 화면 상태로 들고 있어서, 서버에서 오류가 돌아와도 입력한 값이 지워지지 않는다
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(members.map((m) => m.id))); // 처음엔 모두 참석

  const 바꾸기 = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">회차 이름</span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="예: 제2차 회의"
            className={`${입력칸} w-full`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">회의 일시</span>
          <span className="ml-2 text-sm text-muted">한국 시간 · 이 시각부터 평가 가능</span>
          <input
            name="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={`${입력칸} w-full`}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">
          참석 위원 <span className="font-normal text-muted">({checked.size}명 선택 · 회의 상세에서 나중에 바꿀 수 있음)</span>
        </legend>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-muted">위원 명단 탭에서 위원을 먼저 추가해 주세요.</p>
        ) : (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="memberIds"
                    value={m.id}
                    checked={checked.has(m.id)}
                    onChange={() => 바꾸기(m.id)}
                    className="h-5 w-5"
                  />
                  {m.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {state.errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
          {state.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "저장 중…" : "회의 등록"}
      </Button>
    </form>
  );
}
