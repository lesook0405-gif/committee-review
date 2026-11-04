"use client";
// 누르면 서버 처리 하나를 실행하는 버튼 (제외·다시 추가·재발급·차단처럼 입력칸 없는 동작용)
// 서버에서 거부하면 버튼 옆에 한국어 안내를 보여 준다.
import { useActionState } from "react";

import { Button } from "@/components/Button";

type State = { errors: string[] };

type ActionButtonProps = {
  action: (state: State) => Promise<State>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** 화면 읽기 프로그램용 설명 (예: "가상위원 가 이 회의에서 제외") */
  ariaLabel?: string;
};

export function ActionButton({ action, label, pendingLabel = "처리 중…", variant = "secondary", ariaLabel }: ActionButtonProps) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Button type="submit" variant={variant} disabled={pending} aria-label={ariaLabel}>
        {pending ? pendingLabel : label}
      </Button>
      {state.errors.length > 0 ? (
        <span role="alert" className="text-sm text-danger">
          {state.errors.join(" ")}
        </span>
      ) : null}
    </form>
  );
}
