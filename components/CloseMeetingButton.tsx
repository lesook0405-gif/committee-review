"use client";
// [평가 마감] — 되돌릴 수 없는 동작이라 한 번 더 확인한다. 서버가 전원 제출 여부를 다시 확인하므로,
// 화면에서 막아 둔 버튼(전원 제출 전)과 상관없이 서버에서도 거부된다.
import { useActionState, useState } from "react";

import { Button } from "@/components/Button";

type State = { errors: string[]; closed?: boolean };

export function CloseMeetingButton({ action, disabledReason }: { action: (state: State) => Promise<State>; disabledReason: string | null }) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  const [confirming, setConfirming] = useState(false);

  if (disabledReason) {
    return (
      <div>
        <Button disabled aria-describedby="close-disabled-reason">
          평가 마감
        </Button>
        <p id="close-disabled-reason" className="mt-2 text-sm text-muted">
          {disabledReason}
        </p>
      </div>
    );
  }

  return (
    <div>
      {!confirming ? (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          평가 마감
        </Button>
      ) : (
        <form action={formAction} className="rounded-md border border-danger bg-background p-4">
          <p className="font-semibold">정말 평가를 마감할까요?</p>
          <p className="mt-1 text-sm text-muted">
            마감하면 되돌릴 수 없습니다. 위원은 점수를 낼 수도 고칠 수도 없고, 담당 팀원도 대리 입력·제척·참석 위원 변경을 할 수 없습니다. 마감 후에 집계 결과를 볼 수 있습니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "마감하는 중…" : "마감 확정"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              취소
            </Button>
          </div>
        </form>
      )}
      {state.errors.length > 0 ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
