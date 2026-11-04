"use client";
// Design Ref: §3.2 ③ 평가 방식 탭 — 항목 이름·배점(최대 10줄), 배점 합계 자동 계산, 가결 기준 점수(0~합계 정수), 최고·최저 제외
// 화면 검사는 편의를 위한 것이고, 같은 규칙을 서버(lib/rules/committee.ts)와 데이터베이스에서 다시 검사한다.
import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { CRITERIA_MAX_COUNT } from "@/lib/rules/committee";

type Row = { name: string; maxScore: string };
export type ScoringFormState = { errors: string[]; saved?: boolean };

type ScoringFormProps = {
  /** create = 위원회 등록(이름 칸 포함), edit = 평가 방식 수정 */
  mode: "create" | "edit";
  action: (state: ScoringFormState, formData: FormData) => Promise<ScoringFormState>;
  initial?: { criteria: { name: string; maxScore: number }[]; passScore: number; excludeExtremes: boolean };
};

// 폭은 칸마다 따로 준다 (공통 모양에 폭을 넣으면 좁은 칸의 폭이 무시된다)
const 입력칸 =
  "block min-h-11 rounded-md border border-border bg-surface px-3 text-base " +
  "focus:border-primary focus:outline-2 focus:outline-primary";

const 기본_항목: Row[] = [{ name: "", maxScore: "" }];

export function ScoringForm({ mode, action, initial }: ScoringFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  const [rows, setRows] = useState<Row[]>(
    initial ? initial.criteria.map((c) => ({ name: c.name, maxScore: String(c.maxScore) })) : 기본_항목,
  );
  // 모든 칸을 화면 상태로 들고 있어서, 서버에서 오류가 돌아와도 입력한 값이 지워지지 않는다
  const [name, setName] = useState("");
  const [passScore, setPassScore] = useState(initial ? String(initial.passScore) : "");
  const [excludeExtremes, setExcludeExtremes] = useState(initial?.excludeExtremes ?? false);

  const total = rows.reduce((sum, row) => {
    const n = Number(row.maxScore);
    return sum + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

  const 항목_바꾸기 = (index: number, key: keyof Row, value: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {mode === "create" ? (
        <label className="block">
          <span className="text-sm font-semibold">위원회 이름</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className={`mt-1 w-full ${입력칸}`}
            placeholder="예: 투자심사위원회"
          />
        </label>
      ) : null}

      <fieldset>
        <legend className="text-sm font-semibold">
          평가 항목과 배점 <span className="font-normal text-muted">(최대 {CRITERIA_MAX_COUNT}개, 배점은 1점 이상 정수)</span>
        </legend>
        <ol className="mt-2 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-right text-muted">{index + 1}.</span>
              <input
                name="criteriaName"
                aria-label={`${index + 1}번 항목 이름`}
                value={row.name}
                onChange={(e) => 항목_바꾸기(index, "name", e.target.value)}
                maxLength={50}
                placeholder="항목 이름 (예: 적정성)"
                className={`${입력칸} min-w-0 flex-1 basis-40`}
              />
              <input
                name="criteriaMax"
                aria-label={`${index + 1}번 항목 배점`}
                value={row.maxScore}
                onChange={(e) => 항목_바꾸기(index, "maxScore", e.target.value)}
                inputMode="numeric"
                placeholder="배점"
                className={`${입력칸} w-24`}
              />
              <span className="text-muted">점</span>
              <Button
                variant="secondary"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                disabled={rows.length <= 1}
                aria-label={`${index + 1}번 항목 빼기`}
              >
                빼기
              </Button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => setRows((prev) => [...prev, { name: "", maxScore: "" }])}
            disabled={rows.length >= CRITERIA_MAX_COUNT}
          >
            + 항목 추가
          </Button>
          <p className="text-base">
            배점 합계 <strong data-testid="total">{total}</strong>점
          </p>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-semibold">가결 기준 점수</span>
        <span className="ml-2 text-sm text-muted">평균이 이 점수 이상이면 가결 (0 ~ {total}점 정수)</span>
        <input
          name="passScore"
          value={passScore}
          onChange={(e) => setPassScore(e.target.value)}
          inputMode="numeric"
          placeholder="예: 70"
          className={`mt-1 ${입력칸} w-32`}
        />
      </label>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="excludeExtremes"
          checked={excludeExtremes}
          onChange={(e) => setExcludeExtremes(e.target.checked)}
          className="h-5 w-5"
        />
        <span>
          최고점·최저점 제외
          <span className="block text-sm text-muted">평가를 낸 위원이 5명 이상일 때만, 합계가 가장 높은 1명과 가장 낮은 1명을 빼고 평균을 냅니다.</span>
        </span>
      </label>

      {state.errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
          {state.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-success">
          평가 방식을 저장했습니다.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "저장 중…" : mode === "create" ? "위원회 등록" : "평가 방식 저장"}
      </Button>
    </form>
  );
}
