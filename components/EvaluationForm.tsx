"use client";
// Design Ref: §3.2 ⑧ 위원: 평가 입력·수정 — 항목·배점으로 자동 생성한 입력칸, 합계 자동 표시
// 정수가 아니거나, 배점을 넘거나, 빈칸이 있으면 해당 칸 아래 빨간 글씨로 안내하고 제출 버튼을 막는다.
// 서버도 같은 규칙으로 다시 검사한다.
// 작업 17: 입력하는 대로 이 기기(브라우저)에 임시 저장하고, 화면을 닫았다 다시 열면 이어서 입력한다. 제출하면 임시 저장을 지운다.
//   임시 저장은 서버로 보내지 않으며, 제출해야 담당자에게 전달된다. (저장 규칙은 lib/rules/evaluation-draft.ts)
import { useActionState, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/Button";
import { checkScoreText, runningTotal, scoreFieldName, type Criterion } from "@/lib/rules/evaluation";
import { isWorthSaving, parseDraft, serializeDraft } from "@/lib/rules/evaluation-draft";

type State = { errors: string[]; fieldErrors?: (string | null)[]; saved?: boolean; total?: number };

type EvaluationFormProps = {
  action: (state: State, formData: FormData) => Promise<State>;
  criteria: Criterion[];
  /** 이미 낸 점수 (고치기) — 없으면 빈칸으로 시작 */
  initialScores: number[] | null;
  /** 임시 저장 보관 이름 (위원·안건별, 링크값은 들어 있지 않음) */
  draftKey: string;
};

// 브라우저 저장소는 막혀 있을 수 있다(사생활 보호 모드, 저장소 차단 등). 실패해도 입력과 제출은 그대로 되어야 한다.
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
const subscribeNothing = () => () => {};

/**
 * 저장소에서 임시 저장을 "화면을 연 순간 한 번만" 읽는다.
 * (입력하면서 저장소가 계속 바뀌어도 양식이 새로 그려지지 않게, 처음 읽은 값을 이 화면이 계속 쓴다. 서버가 그리는 첫 화면에서는 읽지 않는다.)
 */
export function EvaluationForm(props: EvaluationFormProps) {
  const holder = useRef<{ key: string; raw: string | null } | null>(null);
  const raw = useSyncExternalStore(
    subscribeNothing,
    () => {
      if (!holder.current || holder.current.key !== props.draftKey) holder.current = { key: props.draftKey, raw: readStored(props.draftKey) };
      return holder.current.raw;
    },
    () => null,
  );
  const draftTexts = raw === null ? null : parseDraft(raw, props.criteria, new Date());
  return <EvaluationFields key={draftTexts ? "restored" : "fresh"} {...props} restoredTexts={draftTexts} />;
}

function EvaluationFields({ action, criteria, initialScores, draftKey, restoredTexts }: EvaluationFormProps & { restoredTexts: string[] | null }) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  const serverTexts = criteria.map((_, i) => (initialScores?.[i] !== undefined ? String(initialScores[i]) : ""));
  const [texts, setTexts] = useState<string[]>(restoredTexts ?? serverTexts);
  // 칸을 한 번이라도 만졌거나 서버가 안내를 보낸 칸만 빨간 글씨로 알려 준다 (처음부터 빈칸에 경고가 쏟아지지 않게)
  const [touched, setTouched] = useState<boolean[]>(() => criteria.map(() => false));
  const [restored, setRestored] = useState(restoredTexts !== null);
  const [saveFailed, setSaveFailed] = useState(false);

  const results = criteria.map((c, i) => checkScoreText(texts[i] ?? "", c.maxScore));
  const allValid = results.every((r) => r.ok);
  const total = runningTotal(criteria, texts);
  const maxTotal = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  const alreadySubmitted = initialScores !== null;

  // 입력할 때마다 저장 (이벤트가 일어난 그 자리에서 바로 — 서버 요청이 없어 네트워크가 끊겨도 된다)
  function 임시_저장(next: string[]) {
    const ok = isWorthSaving(next, serverTexts) ? writeStored(draftKey, serializeDraft(criteria, next, new Date())) : writeStored(draftKey, null);
    setSaveFailed(!ok);
  }

  function 점수_바꿈(index: number, value: string) {
    const next = texts.map((t, j) => (j === index ? value : t));
    setTexts(next);
    임시_저장(next);
  }

  function 저장된_점수_버리기() {
    setTexts(serverTexts);
    setTouched(criteria.map(() => false));
    setRestored(false);
    writeStored(draftKey, null);
  }

  // 제출은 서버 처리 결과를 받은 뒤에만 임시 저장을 지운다 (제출에 실패하면 입력이 남아 있어야 하므로)
  const [handledSave, setHandledSave] = useState<State | null>(null);
  if (state.saved && handledSave !== state) {
    setHandledSave(state);
    writeStored(draftKey, null);
    setRestored(false);
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {restored ? (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-background px-4 py-3 text-sm">
          <span>이 기기에 저장해 둔 입력 중인 점수를 불러왔습니다.</span>
          <button type="button" onClick={저장된_점수_버리기} className="min-h-11 font-semibold text-primary underline">
            저장된 점수 버리기
          </button>
        </p>
      ) : null}

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
                onChange={(e) => 점수_바꿈(i, e.target.value)}
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

      <p className="text-sm text-muted">
        {saveFailed
          ? "이 브라우저에서는 입력 중인 점수를 자동 저장할 수 없습니다. 화면을 닫기 전에 꼭 제출해 주세요."
          : "입력 중인 점수는 이 기기에 자동 저장됩니다. 하지만 [제출]을 눌러야 담당자에게 전달됩니다."}
      </p>

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
