"use client";
// 회의 일시 수정 (회의 시작 전만 — 화면에서도 숨기고 서버에서도 다시 막는다)
import { useActionState, useState } from "react";

import { Button } from "@/components/Button";

type State = { errors: string[]; saved?: boolean };

type StartsAtFormProps = {
  action: (state: State, formData: FormData) => Promise<State>;
  /** 화면 칸 값 ("2026-11-20T14:00", 한국 시간) */
  initial: string;
};

export function StartsAtForm({ action, initial }: StartsAtFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  const [value, setValue] = useState(initial);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="text-sm font-semibold">회의 일시 수정</span>
        <span className="ml-2 text-sm text-muted">한국 시간 · 회의 시작 전까지만</span>
        <input
          name="startsAt"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 block min-h-11 rounded-md border border-border bg-surface px-3 text-base focus:border-primary focus:outline-2 focus:outline-primary"
        />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "저장 중…" : "일시 저장"}
      </Button>
      {state.errors.length > 0 ? (
        <p role="alert" className="w-full text-sm text-danger">
          {state.errors.join(" ")}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="w-full text-sm text-success">
          회의 일시를 저장했습니다.
        </p>
      ) : null}
    </form>
  );
}
