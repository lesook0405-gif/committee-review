// Design Ref: §3.2 ⑤ 집계 결과 — 안건마다 위원별 항목 점수·합계·비고(대리 입력·제척·최고/최저점 제외), 평균, 가결/부결/평가 없음
// 계산 자체는 lib/rules/aggregate.ts(정수 연산)가 하고, 여기서는 "저장된 기록을 결과표의 줄로 바꾸는 일"만 한다.
// 화면·저장소와 분리한 순수 함수라서 손 계산 예시로 그대로 시험할 수 있다.
import { aggregateAgenda, EXCLUDE_EXTREMES_MIN_COUNT, type AggregateResult } from "./aggregate";
import { eligibleMemberIds } from "./status";

/**
 * 결과표 줄의 종류
 *  counted = 평가 대상이고 평가를 냄(집계에 반영, 최고·최저점 제외된 줄 포함)
 *  missing = 평가 대상인데 평가 기록이 없음 (마감은 전원 제출 뒤에만 되므로 보통 없음)
 *  recused = 이 안건에서 제척된 위원 (이미 낸 평가가 있어도 집계에서 뺌)
 *  removed = 회의에서 제외된 위원 중 평가 기록이 남아 있는 위원 (집계에서 뺌)
 */
export type ResultRowKind = "counted" | "missing" | "recused" | "removed";

export type ResultRow = {
  memberId: string;
  name: string;
  kind: ResultRowKind;
  /** 항목 점수. counted 줄에만 있고, 나머지는 null(화면에는 "—") */
  scores: number[] | null;
  total: number | null;
  /** 담당 팀원이 대리 입력한 평가 */
  isProxy: boolean;
  /** 최고·최저점 제외로 평균에서 빠진 줄 */
  excluded: "high" | "low" | null;
};

export type AgendaResult = {
  rows: ResultRow[];
  aggregate: AggregateResult;
  /** 제외 옵션이 켜져 있지만 반영할 평가가 5건 미만이라 제외하지 않은 경우 */
  excludeSkippedBecauseFew: boolean;
  passScore: number;
  excludeExtremes: boolean;
};

export type ResultInput = {
  /** 이 회의에 참석 기록이 있는 위원 (제외된 위원 포함) */
  participants: readonly { memberId: string; name: string; removed: boolean }[];
  /** 이 안건에서 제척된 위원 */
  recusedMemberIds: Iterable<string>;
  /** 이 안건에 저장된 평가 전부 */
  evaluations: readonly { memberId: string; scores: readonly number[]; total: number; isProxy: boolean }[];
  passScore: number;
  excludeExtremes: boolean;
};

const byName = (a: ResultRow, b: ResultRow) => a.name.localeCompare(b.name, "ko") || a.memberId.localeCompare(b.memberId);

export function buildAgendaResult(input: ResultInput): AgendaResult {
  const recused = new Set(input.recusedMemberIds);
  const eligible = eligibleMemberIds(
    input.participants.filter((p) => !p.removed).map((p) => p.memberId),
    [...recused],
  );
  const eligibleSet = new Set(eligible);
  const record = new Map(input.evaluations.map((e) => [e.memberId, e]));

  const aggregate = aggregateAgenda({
    evaluations: input.evaluations.map((e) => ({ memberId: e.memberId, total: e.total })),
    eligibleMemberIds: eligibleSet,
    passScore: input.passScore,
    excludeExtremes: input.excludeExtremes,
  });
  const excludedHigh = aggregate.kind === "result" ? aggregate.excludedHighMemberId : null;
  const excludedLow = aggregate.kind === "result" ? aggregate.excludedLowMemberId : null;

  const rows: ResultRow[] = [];
  for (const p of input.participants) {
    const e = record.get(p.memberId);
    const base = { memberId: p.memberId, name: p.name, scores: null, total: null, isProxy: false, excluded: null } as const;
    if (p.removed) {
      // 회의에서 제외된 위원은 평가 기록이 남아 있을 때만 보여 준다(집계에서 빠졌다는 설명용)
      if (e) rows.push({ ...base, kind: "removed" });
    } else if (recused.has(p.memberId)) {
      rows.push({ ...base, kind: "recused" });
    } else if (!e) {
      rows.push({ ...base, kind: "missing" });
    } else {
      rows.push({
        ...base,
        kind: "counted",
        scores: [...e.scores],
        total: e.total,
        isProxy: e.isProxy,
        excluded: p.memberId === excludedHigh ? "high" : p.memberId === excludedLow ? "low" : null,
      });
    }
  }
  rows.sort(byName);

  return {
    rows,
    aggregate,
    excludeSkippedBecauseFew: input.excludeExtremes && aggregate.kind === "result" && aggregate.submittedCount < EXCLUDE_EXTREMES_MIN_COUNT,
    passScore: input.passScore,
    excludeExtremes: input.excludeExtremes,
  };
}
