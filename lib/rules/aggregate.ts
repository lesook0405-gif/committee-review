// Design Ref: §5.3 집계 계산 규칙 — 화면·저장소와 분리된 순수 계산 함수 (설계안 C: 규칙은 lib/rules/에만)
// Plan SC: S2 — 집계 결과가 손으로 계산한 값과 100% 같아야 한다.
//
// 이 파일이 지키는 PRD 규칙 (PRD 5번 must 2 "AI가 지킬 규칙")
//   1. 평가 대상(회의에서 빠진 위원·제척된 위원 제외)의 평가만 반영한다.
//   2. 반영할 평가가 0건이면 "평가 없음"이고 가결·부결을 내지 않는다.
//   3. 위원별 합계의 평균으로 집계한다.
//   4. 제외 옵션이 켜져 있고 반영할 평가가 5건 이상이면, 최고점 1개와 최저점 1개를 뺀다.
//      같은 점수가 여러 개여도 1개씩만 뺀다.
//   5. 가결 여부는 반올림하기 전 평균으로 판단한다. (평균 ≥ 기준 점수 → 가결)
//   6. 화면에는 소수점 둘째 자리에서 반올림한 값(소수점 첫째 자리까지)을 보여 준다. 딱 반이면 올린다.
//
// 소수 계산 오차를 막기 위해 나눗셈 없이 정수로만 계산한다.
//   - 가결 판단: 평균 ≥ 기준  ⇔  합계 S ≥ 기준 × 개수 n
//   - 표시 값(0.1점 단위 정수): round(S × 10 ÷ n) = floor((20 × S + n) ÷ (2 × n))

/** 최고·최저점 제외를 적용하는 최소 제출 수 (PRD: "5명 이상일 때만") */
export const EXCLUDE_EXTREMES_MIN_COUNT = 5;

/** 위원 1명이 낸 평가의 합계 */
export type EvaluationTotal = {
  memberId: string;
  /** 항목 점수의 합 (0 이상의 정수) */
  total: number;
};

export type AggregateInput = {
  /** 그 안건에 저장된 평가 전부 (제외·제척된 위원의 기록이 섞여 있어도 된다) */
  evaluations: readonly EvaluationTotal[];
  /** 그 안건의 평가 대상 위원 (회의에서 빠진 위원·제척된 위원을 뺀 목록) */
  eligibleMemberIds: Iterable<string>;
  /** 가결 기준 점수 (0 이상의 정수) */
  passScore: number;
  /** 최고·최저점 제외 옵션 */
  excludeExtremes: boolean;
};

export type AggregateResult =
  | {
      kind: "no-evaluations"; // 평가 없음 — 가결·부결 없음
    }
  | {
      kind: "result";
      /** 반영된 평가 수 (제외 전) */
      submittedCount: number;
      /** 평균 계산에 실제로 쓴 평가 수 n (제외 후) */
      usedCount: number;
      /** 평균 계산에 쓴 합계의 총합 S */
      sum: number;
      /** 표시용 평균을 0.1점 단위 정수로 나타낸 값 (예: 77.3점 → 773) */
      averageTenths: number;
      /** 표시용 평균 글자 (예: "77.3") */
      averageText: string;
      /** 가결 여부 (반올림 전 평균으로 판단) */
      passed: boolean;
      /** 최고점으로 제외된 위원 (제외하지 않았으면 null) */
      excludedHighMemberId: string | null;
      /** 최저점으로 제외된 위원 (제외하지 않았으면 null) */
      excludedLowMemberId: string | null;
    };

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}은(는) 0 이상의 정수여야 합니다. (받은 값: ${value})`);
  }
}

/** 0.1점 단위 정수를 "77.3" 같은 글자로 바꾼다 */
export function formatTenths(tenths: number): string {
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** 안건 하나의 평가를 집계한다 */
export function aggregateAgenda(input: AggregateInput): AggregateResult {
  assertNonNegativeInteger(input.passScore, "가결 기준 점수");

  // 규칙 1 — 평가 대상의 평가만 남긴다
  const eligible = new Set(input.eligibleMemberIds);
  const counted = input.evaluations.filter((evaluation) => eligible.has(evaluation.memberId));
  for (const evaluation of counted) {
    assertNonNegativeInteger(evaluation.total, "평가 합계");
  }

  // 규칙 2 — 반영할 평가가 없으면 "평가 없음"
  if (counted.length === 0) {
    return { kind: "no-evaluations" };
  }

  // 규칙 4 — 5건 이상이면 최고·최저 1개씩 제외 (같은 점수가 여러 개여도 1개씩만)
  // 같은 점수끼리는 위원 ID 순으로 정렬해, 누구를 제외 표시할지 항상 똑같이 정해지게 한다.
  const sorted = [...counted].sort(
    (a, b) => a.total - b.total || a.memberId.localeCompare(b.memberId),
  );
  const shouldExclude = input.excludeExtremes && sorted.length >= EXCLUDE_EXTREMES_MIN_COUNT;
  const used = shouldExclude ? sorted.slice(1, -1) : sorted;

  // 규칙 3·5·6 — 정수 연산으로 평균, 가결, 표시 값 계산
  const n = used.length;
  const sum = used.reduce((acc, evaluation) => acc + evaluation.total, 0);
  const passed = sum >= input.passScore * n;
  const averageTenths = Math.floor((20 * sum + n) / (2 * n));

  return {
    kind: "result",
    submittedCount: counted.length,
    usedCount: n,
    sum,
    averageTenths,
    averageText: formatTenths(averageTenths),
    passed,
    excludedHighMemberId: shouldExclude ? sorted[sorted.length - 1].memberId : null,
    excludedLowMemberId: shouldExclude ? sorted[0].memberId : null,
  };
}
