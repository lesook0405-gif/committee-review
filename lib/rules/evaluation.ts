// Design Ref: §3.2 ⑧ 위원: 평가 입력·수정 / §5.2 평가 입력
// PRD 5번 must 2 "AI가 지킬 규칙": 각 항목 점수는 0부터 그 항목 배점까지 정수만, 빈 항목이 있으면 제출할 수 없다.
// 화면(실시간 안내)과 서버(저장 전 검사)가 같은 규칙을 쓰도록 여기에 한 벌만 둔다. 데이터베이스 함수(submit_evaluation)도 같은 규칙으로 다시 검사한다.

export type Criterion = { name: string; maxScore: number };

/** 점수 칸 이름 (FormData): score-0, score-1 … */
export const scoreFieldName = (index: number) => `score-${index}`;

/** 점수 한 칸 검사 — 통과하면 정수, 아니면 한국어 안내 한 줄 */
export function checkScoreText(text: string, maxScore: number): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, message: "점수를 입력해 주세요." };
  // 숫자 한 덩어리(0~9)만 받는다: 소수점·음수·지수(1e2)·16진수·글자는 모두 거부. 길이도 제한해 아주 큰 값을 막는다.
  if (!/^\d{1,6}$/.test(trimmed)) return { ok: false, message: "0 이상의 정수만 입력할 수 있습니다." };
  const value = Number(trimmed);
  if (value > maxScore) return { ok: false, message: `배점(${maxScore}점)을 넘을 수 없습니다.` };
  return { ok: true, value };
}

export type ScoresCheck =
  | { ok: true; scores: number[]; total: number }
  | { ok: false; fieldErrors: (string | null)[]; messages: string[] };

/** 항목마다 입력한 글자 → 점수 배열과 합계. 하나라도 틀리면 칸별 안내를 돌려준다 */
export function checkScores(criteria: readonly Criterion[], texts: readonly string[]): ScoresCheck {
  const fieldErrors: (string | null)[] = [];
  const scores: number[] = [];
  criteria.forEach((c, i) => {
    const r = checkScoreText(texts[i] ?? "", c.maxScore);
    fieldErrors.push(r.ok ? null : r.message);
    if (r.ok) scores.push(r.value);
  });
  if (fieldErrors.some((e) => e !== null)) {
    const messages = criteria.flatMap((c, i) => (fieldErrors[i] ? [`${c.name}: ${fieldErrors[i]}`] : []));
    return { ok: false, fieldErrors, messages };
  }
  return { ok: true, scores, total: scores.reduce((a, b) => a + b, 0) };
}

/** 화면 입력칸(FormData) → 항목 순서대로 입력한 글자 */
export function readScoreTexts(formData: FormData, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(formData.get(scoreFieldName(i)) ?? ""));
}

/** 입력 중인 칸들의 합계 (아직 틀린 칸은 0으로 보고 더한다 — 화면의 "합계 N / 배점 합계" 표시용) */
export function runningTotal(criteria: readonly Criterion[], texts: readonly string[]): number {
  return criteria.reduce((sum, c, i) => {
    const r = checkScoreText(texts[i] ?? "", c.maxScore);
    return sum + (r.ok ? r.value : 0);
  }, 0);
}

/** 평가를 낼 수 있는 때인지 — 회의 시작 시각부터(같은 시각 포함) 마감 전까지 */
export type EvaluationWindow = "not-started" | "open" | "closed";
export function evaluationWindow(meeting: { status: "open" | "closed"; startsAt: string }, now: Date): EvaluationWindow {
  if (meeting.status === "closed") return "closed";
  return now.getTime() < new Date(meeting.startsAt).getTime() ? "not-started" : "open";
}
