"use client";
// Design Ref: §3.2 ⑧ 위원: 평가 입력·수정 — 항목·배점으로 자동 생성한 입력칸, 합계 자동 표시
// 정수가 아니거나, 배점을 넘거나, 빈칸이 있으면 해당 칸 아래 빨간 글씨로 안내하고 제출 버튼을 막는다.
// 서버도 같은 규칙으로 다시 검사한다. (입력 중 임시 저장은 PLAN 작업 17에서 붙인다)
import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { checkScoreText, runningTotal, scoreFieldName, type Criterion } from "@/lib/rules/evaluation";

type State = { errors: string[]; fieldErrors?: (string | null)[]; saved?: boolean; total?: number };

type EvaluationFormProps = {
  action: (state: State, formData: FormData) => Promise<State>;
  criteria: Criterion[];
  /** 이미 낸 점수 (고치기) — 없으면 빈칸으로 시작 */
  initialScores: number[] | null;
};

export function EvaluationForm({ action, criteria, initialScores }: EvaluationFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  const [texts, setTexts] = useState<string[]>(() => criteria.map((_, i) => (initialScores?.[i] !== undefined ? String(initialScores[i]) : "")));
  // 칸을 한 번이라도 만졌거나 서버가 안내를 보낸 칸만 빨간 글씨로 알려 준다 (처음부터 빈칸에 경고가 쏟아지지 않게)
  const [touched, setTouched] = useState<boolean[]>(() => criteria.map(() => false));

  const results = criteria.map((c, i) => checkScoreText(texts[i] ?? "", c.maxScore));
  const allValid = results.every((r) => r.ok);
  const total = runningTotal(criteria, texts);
  const maxTotal = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  const alreadySubmitted = initialScores !== null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <ul className="space-y-4">
        {criteria.map((c, i) => {
          const r = results[i];
          const 서버_안내 = state.fieldErrors?.[i] ?? null;
          const 안내 = !r.ok && (touched[i] || 서버_안내) ? r.message : null;
          const id = `score-input-${i}`;
          return (
            <li key={i}>
              <label htmlFor={id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-lg font-semibold">{c.name}</span>
                <span className="text-sm text-muted">0 ~ {c.maxScore}점</span>
              </label>
              <input
                id={id}
                name={scoreFieldName(i)}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={texts[i]}
                onChange={(e) => setTexts((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
                onBlur={() => setTouched((prev) => prev.map((t, j) => (j === i ? true : t)))}
                aria-invalid={안내 ? true : undefined}
                aria-describedby={안내 ? `${id}-error` : undefined}
                disabled={pending}
                className={`mt-1 block min-h-12 w-full max-w-xs rounded-md border bg-surface px-3 text-xl focus:outline-2 focus:outline-primary ${
                  안내 ? "border-danger" : "border-border"
                }`}
              />
              {안내 ? (
                <p id={`${id}-error`} className="mt-1 text-sm text-danger">
                  {안내}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="border-t border-border pt-3 text-lg">
        합계 <strong className="text-2xl">{total}</strong> <span className="text-muted">/ {maxTotal}점</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !allValid}>
          {pending ? "제출 중…" : alreadySubmitted || state.saved ? "수정해서 다시 제출" : "제출"}
        </Button>
        {!allValid ? <span className="text-sm text-muted">모든 항목에 올바른 점수를 입력하면 제출할 수 있습니다.</span> : null}
      </div>

      {state.errors.length > 0 ? (
        <p role="alert" className="text-sm text-danger">
          {state.errors.join(" ")}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-md bg-background px-4 py-3 text-base text-success">
          제출 완료 — 합계 {state.total}점. 마감 전까지는 같은 화면에서 고쳐 다시 제출할 수 있습니다.
        </p>
      ) : null}
    </form>
  );
}
